import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Cross-platform project root (works correctly on Windows drive-letter paths too).
const projectRoot = fileURLToPath(new URL('../', import.meta.url));

function walk(path) {
  const files = [];
  for (const entry of readdirSync(path)) {
    if (['node_modules', 'dist', '.git'].includes(entry)) continue;
    const full = join(path, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const targets = [
  ...walk(join(projectRoot, 'src')),
  join(projectRoot, 'index.html'),
  join(projectRoot, 'README.md'),
  join(projectRoot, 'package.json'),
  join(projectRoot, 'package-lock.json'),
].filter(existsSync);

const forbidden = [
  ['به', 'تان'].join(''),
  ['سلامتی', ' من'].join(''),
  ['persian', '-diet-app'].join(''),
  ['vite', '.svg'].join(''),
];

for (const file of targets) {
  const content = readFileSync(file, 'utf8');
  for (const token of forbidden) {
    assert.ok(
      !content.includes(token),
      `Legacy brand token "${token}" found in ${relative(projectRoot, file)}`,
    );
  }
}

const brandFile = readFileSync(join(projectRoot, 'src/constants/brand.ts'), 'utf8');
assert.ok(
  brandFile.includes("APP_NAME_FA = 'به‌تن'"),
  'Persian brand name must be exactly «به‌تن».',
);
assert.ok(
  brandFile.includes("APP_NAME_EN = 'Behtan'"),
  'English brand name must be exactly Behtan.',
);
assert.ok(
  existsSync(join(projectRoot, 'public/behtan-logo.png')),
  'Official Behtan logo is missing.',
);

console.log('✅ Behtan brand smoke test passed');
console.log('   Persian name: به‌تن');
console.log('   English name: Behtan');
console.log('   Legacy brand references: none');
console.log('   Official logo asset: present');
