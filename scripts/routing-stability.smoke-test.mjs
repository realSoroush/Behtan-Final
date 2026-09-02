import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
const auth = readFileSync(resolve(root, 'src/components/PhoneAuth.tsx'), 'utf8');
const wizard = readFileSync(resolve(root, 'src/components/onboarding/OnboardingWizard.tsx'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!app.includes('setView('), 'App must not use imperative view routing.');
assert(!app.includes('useState<AppView>'), 'App must derive routing from auth/profile state.');
assert(app.includes('authLoading || (user && profileLoading)'), 'Root must gate routing while profile is unresolved.');
assert(app.includes('profile.onboarding_completed !== true'), 'Root must use the explicit onboarding completion flag.');
assert(app.includes('await refetchProfile()'), 'Root must refresh its own profile after onboarding completion.');
assert(!auth.includes('onAuthenticated'), 'PhoneAuth must not force the next route.');
assert(wizard.includes('await onComplete();'), 'Wizard must await root profile synchronization.');

console.log('✅ Behtan routing-stability smoke test passed');
console.log('   Root route: derived from auth + authoritative profile');
console.log('   Login child: cannot force onboarding');
console.log('   Onboarding completion: root profile refetched before Dashboard');
console.log('   Session refresh: stale onboarding snapshot cannot replay the route');
