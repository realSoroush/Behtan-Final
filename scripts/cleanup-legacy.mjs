import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const targets = [
  'src/hooks/useFoodExchanges.ts',
  'supabase/seed_food_exchanges.sql',
];

let removed = 0;
for (const target of targets) {
  const fullPath = resolve(root, target);
  if (existsSync(fullPath)) {
    rmSync(fullPath);
    console.log(`removed: ${target}`);
    removed += 1;
  }
}

console.log(`✅ Legacy cleanup complete (${removed} file${removed === 1 ? '' : 's'} removed)`);
