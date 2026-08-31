import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const provider = readFileSync(resolve(root, 'src/theme/ThemeProvider.tsx'), 'utf8');
const toggle = readFileSync(resolve(root, 'src/components/ui/ThemeToggle.tsx'), 'utf8');
const main = readFileSync(resolve(root, 'src/main.tsx'), 'utf8');
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
const dashboard = readFileSync(resolve(root, 'src/components/dashboard/DashboardPage.tsx'), 'utf8');
const auth = readFileSync(resolve(root, 'src/components/PhoneAuth.tsx'), 'utf8');
const onboarding = readFileSync(resolve(root, 'src/components/onboarding/OnboardingWizard.tsx'), 'utf8');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`Theme smoke test failed: ${message}`);
}

assert(provider.includes("behtan-theme"), 'persistent theme key is missing');
assert(provider.includes("classList.toggle('dark'"), 'dark class application is missing');
assert(provider.includes('prefers-color-scheme: dark'), 'system-theme fallback is missing');
assert(toggle.includes('Moon') && toggle.includes('Sun'), 'toggle icons are missing');
assert(main.includes('<ThemeProvider>'), 'ThemeProvider does not wrap the app');
assert(!app.includes('// Dark mode: check system preference'), 'legacy App theme listener is still present');
assert(dashboard.includes('<ThemeToggle'), 'dashboard toggle is missing');
assert(auth.includes('<ThemeToggle'), 'auth toggle is missing');
assert(onboarding.includes('<ThemeToggle'), 'onboarding toggle is missing');
assert(html.includes("localStorage.getItem('behtan-theme')"), 'no-flash bootstrap is missing');

console.log('✅ Behtan theme smoke test passed');
console.log('   Manual Light/Dark toggle: wired');
console.log('   Theme persistence: localStorage');
console.log('   Initial system-theme fallback: enabled');
console.log('   Login / Onboarding / Dashboard toggle: present');
console.log('   Refresh flash prevention: enabled');
