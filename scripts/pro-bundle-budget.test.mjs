import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// Count every statically loaded JS chunk. Dynamic features are intentionally excluded.
for (const output of ['dist-pro', 'dist-admin']) {
  const manifest = JSON.parse(readFileSync(join(output, '.vite/manifest.json'), 'utf8'));
  const seen = new Set();
  function visit(key) {
    if (seen.has(key)) return;
    seen.add(key);
    for (const dependency of manifest[key].imports ?? []) visit(dependency);
  }
  for (const [key, entry] of Object.entries(manifest)) if (entry.isEntry) visit(key);
  assert(seen.size > 0, 'No entry found in ' + output);
  const files = [...new Set([...seen].map(key => manifest[key].file))].filter(file => file.endsWith('.js'));
  assert(files.length > 0, 'No entry JavaScript found in ' + output);
  const buffers = files.map(file => readFileSync(join(output, file)));
  const raw = buffers.reduce((size, data) => size + data.length, 0);
  const gzip = buffers.reduce((size, data) => size + gzipSync(data).length, 0);
  console.log(`${output}: ${raw} bytes raw, ${gzip} bytes gzip in ${files.length} initial JS chunk(s)`);
  assert(raw <= 500_000 && gzip <= 145_000, 'Initial JavaScript budget exceeded in ' + output);
}
