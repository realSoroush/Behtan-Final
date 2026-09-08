import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { PhoneAuth } from '@/components/PhoneAuth';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { DashboardPage } from '@/components/dashboard/DashboardPage';
import { SafetyReviewPage } from '@/components/safety/SafetyReviewPage';
import { MedicalSafetyBlockedPage } from '@/components/safety/MedicalSafetyBlockedPage';
import { evaluateProfileMedicalEligibility } from '@/utils/medicalEligibility';
import { LandingPage } from '@/components/landing/LandingPage';
import { BillingAccess } from '@/components/billing/BillingAccess';

function isAuthRequested() {
  return typeof window !== 'undefined' && window.location.hash === '#auth';
}

/**
 * App routing is intentionally derived from authoritative auth/profile state.
 *
 * Do not keep a second, imperative `view` state here. In the past the child
 * auth/onboarding screens could force a route while App still held a stale
 * profile snapshot. A later Supabase auth event (token refresh, tab visibility,
 * session recovery, ...) would then re-evaluate that stale snapshot and briefly
 * send a completed user back into onboarding.
 */
export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const {
    profile,
    loading: profileLoading,
    refetch: refetchProfile,
    upsertProfile,
  } = useUserProfile(user?.id);
  const [reviewingSafetyForUserId, setReviewingSafetyForUserId] = useState<string | null>(null);
  const [authRequested, setAuthRequested] = useState(isAuthRequested);

  useEffect(() => {
    const handleHashChange = () => setAuthRequested(isAuthRequested());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!user || window.location.hash !== '#auth') return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setAuthRequested(false);
  }, [user]);

  const openAuth = () => {
    if (window.location.hash !== '#auth') window.history.pushState(null, '', '#auth');
    setAuthRequested(true);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const closeAuth = () => {
    if (window.location.hash === '#auth') window.history.pushState(null, '', window.location.pathname + window.location.search);
    setAuthRequested(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (authLoading || (user && profileLoading)) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-neutral-500 dark:text-neutral-400 text-sm">در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return authRequested ? <PhoneAuth onBack={closeAuth} /> : <LandingPage onStart={openAuth} />;
  }

  if (!profile || profile.onboarding_completed !== true) {
    return (
      <OnboardingWizard
        onComplete={async () => {
          await refetchProfile();
        }}
      />
    );
  }

  const medicalEligibility = evaluateProfileMedicalEligibility(profile);

  if (medicalEligibility.status === 'needs_screening' || reviewingSafetyForUserId === user.id) {
    return (
      <SafetyReviewPage
        profile={profile}
        onSignOut={signOut}
        onSave={async (medical) => {
          await upsertProfile({ medical_conditions_json: medical });
          await refetchProfile();
          setReviewingSafetyForUserId(null);
        }}
      />
    );
  }

  if (!medicalEligibility.canGenerateAutomaticPlan) {
    return (
      <MedicalSafetyBlockedPage
        eligibility={medicalEligibility}
        onReviewAnswers={() => setReviewingSafetyForUserId(user.id)}
        onSignOut={signOut}
      />
    );
  }

  return <BillingAccess key={user.id} onSignOut={signOut}><DashboardPage /></BillingAccess>;
}
