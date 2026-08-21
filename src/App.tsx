import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { PhoneAuth } from '@/components/PhoneAuth';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { DashboardPage } from '@/components/dashboard/DashboardPage';

type AppView = 'loading' | 'auth' | 'onboarding' | 'dashboard';

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useUserProfile(user?.id);
  const [view, setView] = useState<AppView>('loading');

  // Dark mode: check system preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.matches) document.documentElement.classList.add('dark');
    const handler = (e: MediaQueryListEvent) =>
      document.documentElement.classList.toggle('dark', e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (authLoading || profileLoading) {
      setView('loading');
      return;
    }
    if (!user) {
      setView('auth');
      return;
    }
    // User is authenticated. Show onboarding if no profile data yet.
    if (!profile || !profile.goal) {
      setView('onboarding');
      return;
    }
    setView('dashboard');
  }, [authLoading, profileLoading, user, profile]);

  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-neutral-500 dark:text-neutral-400 text-sm">در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  if (view === 'auth') {
    return <PhoneAuth onAuthenticated={() => setView('onboarding')} />;
  }

  if (view === 'onboarding') {
    return (
      <OnboardingWizard
        onComplete={() => setView('dashboard')}
      />
    );
  }

  return <DashboardPage />;
}
