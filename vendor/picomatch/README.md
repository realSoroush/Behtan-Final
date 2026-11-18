# Local picomatch security fork

This private package is based on the unchanged npm picomatch 4.0.7 distribution,
with its MIT license retained. It is not an upstream release or a general claim
that arbitrary regular expressions are safe.

- Source: https://github.com/micromatch/picomatch/tree/4.0.7
- npm archive SHA-1: 6313360034ccb36b3dc61ecbdff78121f90fe21f
- npm integrity: sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==
- Advisory: https://github.com/advisories/GHSA-fc5q-39xc-vjpf
- Original file hashes: upstream-sha256.json

The only runtime change is a guard in lib/parse.js extglobOpen: `+(...)`
and `*(...)` are rejected with ERR_BUILD_REPEATED_EXTGLOB before regex
construction, even when maxExtglobRecursion is false. The build-pattern subset
deliberately excludes ALL repeated extglobs, including otherwise safe ones.
Ordinary wildcards/globstars, braces, character classes, negative/optional/choice
extglobs and escaping remain available. Unsupported repeat patterns fail loudly
instead of silently omitting source files. This is a conservative mitigation for
this repository's trusted build patterns, not a general regex safety engine.

All transitive picomatch imports resolve here through the root npm override,
including direct lib/parse.js consumers. No audit warning is filtered: the
published vulnerable package is replaced with this private patched package.
Because local forks are not covered by upstream npm advisory matching, CI must
run the bounded exploit, source integrity and consumer-resolution regressions alongside both
unmodified npm audit commands. Keep that check in place until this fork is removed.

Remove this fork and the override when a reviewed upstream fix is available;
then run the same exploit tests, npm ci, lint, all three builds and browser CI.
Do not update source/version or weaken the guard just to clear an audit result.
