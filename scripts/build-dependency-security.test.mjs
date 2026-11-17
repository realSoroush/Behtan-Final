import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'package.json'));
const fork = resolve(root, 'vendor/picomatch');
const originalHashes = JSON.parse(readFileSync(resolve(fork, 'upstream-sha256.json')));
for (const path of ['index.js','posix.js','lib/constants.js','lib/picomatch.js','lib/scan.js','lib/utils.js','LICENSE']) {
  assert.equal(createHash('sha256').update(readFileSync(resolve(fork, path))).digest('hex'), originalHashes[path], `${path} must retain the pinned upstream source`);
}
const parser = readFileSync(resolve(fork, 'lib/parse.js'), 'utf8');
const guard = `\n    // Behtan: repeated extglobs are outside the supported build-pattern subset.
    // Reject before constructing regex; no maxExtglobRecursion opt-out.
    if (type === 'plus' || type === 'star') {
      const error = new SyntaxError('Repeated extglobs are disabled by the build security policy');
      error.code = 'ERR_BUILD_REPEATED_EXTGLOB';
      throw error;
    }
`;
assert(parser.includes(guard));
const restored = parser.replace(guard, '');
assert.equal(createHash('sha256').update(restored).digest('hex'), originalHashes['lib/parse.js'], 'Only the documented parser guard may differ from upstream');
const spec = JSON.parse(readFileSync(resolve(root,'package.json'))).devDependencies.picomatch;
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json')));
const installed = Object.entries(lock.packages).filter(([path]) => /(?:^|\/)node_modules\/picomatch$/.test(path));
assert(installed.length > 0);
for (const [path, info] of installed) {
  assert.equal(info.name, '@behtan/picomatch', `${path} must contain the private patched package`);
  assert.equal(info.resolved, spec);
  for (const file of ['index.js','posix.js','lib/constants.js','lib/picomatch.js','lib/parse.js','lib/scan.js','lib/utils.js','LICENSE']) {
    assert.deepEqual(readFileSync(resolve(root,path,file)),readFileSync(resolve(fork,file)),`${path}/${file} must match the reviewed source`);
  }
}
for (const consumer of ['micromatch','anymatch','readdirp','tinyglobby','vite']) {
  const from = createRequire(require.resolve(consumer));
  assert.equal(realpathSync(from.resolve('picomatch')), realpathSync(require.resolve('picomatch')), `${consumer} must not retain a vulnerable nested copy`);
}
assert.equal(require('picomatch/package.json').name, '@behtan/picomatch');

// Control: demonstrate that the exact original parser triggers the advisory.
// SIGKILL bounds resource use even when native RegExp matching blocks Node.
const controlDir = mkdtempSync(resolve(tmpdir(), 'behtan-picomatch-control-'));
try {
  cpSync(fork, controlDir, { recursive: true });
  writeFileSync(resolve(controlDir,'lib/parse.js'),restored);
  const control = spawnSync(process.execPath, ['-e', "require(process.argv[1]).isMatch('a'.repeat(80)+'!', '+(*a)')", controlDir], {
    encoding: 'utf8', timeout: 750, killSignal: 'SIGKILL',
  });
  assert.equal(control.error?.code, 'ETIMEDOUT', 'The unpatched control must reproduce the reported backtracking');
} finally { rmSync(controlDir, { recursive: true, force: true }); }

// Run adversarial matching outside this process. A regression must fail with a
// timeout, never freeze the test runner or rely on a subjective timing margin.
const child = spawnSync(process.execPath, ['--input-type=commonjs', '-e', String.raw`
const assert = require('node:assert/strict');
const pm = require('picomatch');
const parse = require('picomatch/lib/parse');
const patterns = ['+(*)','+(*a)','*(*a)','+(@(*a))','*(@(*a))','+(*a|b)','+(a*|b)','+(*a|*b)','+([a]+)','+(ab|abab)','+(foo|bar)','+([*])'];
for (const options of [{},{capture:true},{bash:true},{windows:true},{fastpaths:false},{maxExtglobRecursion:false},{maxExtglobRecursion:1000000}]) {
  for (const pattern of patterns) {
    const subject = 'a'.repeat(5000) + '!';
    const blocked = {code:'ERR_BUILD_REPEATED_EXTGLOB'};
    assert.throws(()=>pm(pattern,options)(subject),blocked);
    assert.throws(()=>pm.isMatch(subject,pattern,options),blocked);
    assert.throws(()=>pm.makeRe(pattern,options),blocked);
    assert.throws(()=>pm.compileRe(parse(pattern,options),options),blocked);
    assert.throws(()=>pm.compileRe(pm.parse(pattern,options),options),blocked);
  }
}
assert.equal(pm.isMatch('foo','@(foo|bar)'),true);
assert.equal(pm.isMatch('foo','?(foo|bar)'),true);
assert.equal(pm.isMatch('literal*file','literal\\*file'),true);
assert.equal(pm.isMatch('src/page.tsx','**/*.{ts,tsx}'),true);
assert.equal(pm.isMatch('.hidden.ts','**/*.ts'),false);
assert.equal(pm.isMatch('.hidden.ts','**/*.ts',{dot:true}),true);
assert.equal(pm.isMatch('page.test.ts','!(*.test).ts'),false);
process.stdout.write('PASS bounded exploit matrix and compatible safe glob semantics\n');
`], { cwd: root, encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' });
assert.equal(child.error, undefined, child.error?.message);
assert.equal(child.status, 0, child.stderr);
process.stdout.write(child.stdout);
const { glob } = require('tinyglobby');
const files = await glob(['src/**/*.{ts,tsx}', '!src/**/*.d.ts'], { cwd: root });
assert(files.includes('src/professional/menuPlan.ts'));
assert(files.includes('src/components/dashboard/DashboardPage.tsx'));
console.log(`PASS pinned upstream hashes, every installed/consumer resolution and real tinyglobby discovery (${files.length} sources)`);
