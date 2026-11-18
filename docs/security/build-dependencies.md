# Build dependency security

## Local mitigation for GHSA-fc5q-39xc-vjpf

As of 18 November 2026, the [upstream advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) lists picomatch through 4.0.7 as affected with no patched upstream release. The ReDoS occurs when wildcard bodies such as `*a` are wrapped in repeated extglobs such as `+(*a)`: the parser's existing risk analysis omits single-branch shapes.

`vendor/picomatch` is a private downstream fork, **not an official fixed release**. The npm archive and original per-file SHA-256 values are recorded there and its MIT license is retained. The only runtime modification is a guard in `extglobOpen` in `lib/parse.js`: repeated extglobs `+(...)` and `*(...)` throw `ERR_BUILD_REPEATED_EXTGLOB` before regex construction. There is no `maxExtglobRecursion` opt-out. This prevents the reported regex shape for every branch count, including nested forms. It is not a guarantee for arbitrary raw regexes or externally supplied parser states.

Compatibility boundary: **all repeated extglobs are unsupported**, even safe ones such as `+(foo|bar)`. Ordinary globs/globstars, braces, character classes, escaped literals, negative extglobs, optional extglobs and choice extglobs remain available. The repository must not use unsupported repeated patterns. Unsupported patterns fail explicitly rather than silently producing incomplete styles/builds. Build output and browser checks verify the currently used subset.

## Installation and verification

The root development dependency `picomatch` pins `file:vendor/behtan-picomatch-4.0.7+behtan.1.tgz`; the `$picomatch` npm override sends all transitive requests to that reviewed archive. The lockfile pins its SHA-512 integrity. The tarball is built from the adjacent source so clean installs need no postinstall patch, external Git authentication or lifecycle script.

```bash
npm ci
npm run test:build-dependencies
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=moderate
npm run lint
npm run build
npm run build:pro
npm run build:admin
```

The regression verifies unchanged upstream files by hash, reconstructs the original parser by removing the documented guard and checks that hash, compares every installed fork runtime file to the reviewed source, checks consumer resolutions including Vite/Tailwind dependencies, and tests real tinyglobby source discovery. It reproduces the unpatched control in a disposable child terminated after 750 ms, then checks the patched public/direct-parser entry points and opt-out attempts in a separate child with a hard five-second limit. Process termination uses SIGKILL to bound native regex execution.

Both npm audit commands remain unchanged and blocking. **Registry advisory matching does not track a private local fork.** Therefore an audit with zero findings is not sufficient by itself: the source/integrity checks and exploit regression are mandatory. The fork introduces ongoing review responsibility for future upstream advisories.

## Repacking and removal

To reproduce the current archive from source:

```bash
npm pack ./vendor/picomatch --pack-destination vendor --ignore-scripts
```

A changed security patch needs a separately identifiable local archive revision, regenerated lockfile integrity and the same full verification; never edit the archive alone. Once an upstream fix is available, inspect the actual fix, remove the local dependency/override/source/archive, install the reviewed version for all consumers and rerun the exploit matrix, clean install, audit, builds and browser suites. Keep the regression against the installed replacement. No advisory allowlist or skipped audit is introduced by this change.
