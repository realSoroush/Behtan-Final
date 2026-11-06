import type { ReactNode } from 'react';
import { Dumbbell, TrendingUp, UserRound, Utensils } from 'lucide-react';
import { APP_LOGO_PATH, APP_NAME_FA } from '@/constants/brand';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { MEMBER_TIME_ZONE } from '@/utils/dailyMealProgress';
import './member-app.css';

const tabs = [
  { id: 'today', label: 'برنامهٔ امروز', icon: Utensils },
  { id: 'progress', label: 'روند من', icon: TrendingUp },
  { id: 'training', label: 'تمرین', icon: Dumbbell },
  { id: 'profile', label: 'حساب من', icon: UserRound },
] as const;

export type MemberSection = typeof tabs[number]['id'];

export function MemberHomeShell({ section = 'today', navigate, children }: {
  section?: MemberSection;
  navigate?: (section: MemberSection) => void;
  children: ReactNode;
}) {
  const today = new Date().toLocaleDateString('fa-IR', {
    timeZone: MEMBER_TIME_ZONE, weekday: 'long', month: 'long', day: 'numeric',
  });

  return <div className="member-app min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-[calc(6rem+env(safe-area-inset-bottom))]">
    <header className="member-topbar-v2">
      <div>
        <div className="member-brand-v2"><img src={APP_LOGO_PATH} alt={`لوگوی ${APP_NAME_FA}`} /><span>به‌تن<small>{today}</small></span></div>
        <div className="member-header-actions">
          <ThemeToggle />
          <button type="button" className="member-icon-button" aria-label="حساب من"
            onClick={() => { if (navigate) navigate('profile'); else window.location.hash = 'profile'; }}><UserRound size={19} /></button>
        </div>
      </div>
    </header>
    {children}
    <nav aria-label="منوی اصلی" className="member-bottom-nav fixed bottom-0 inset-x-0 z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-md mx-auto grid grid-cols-4 gap-2 px-5 py-2">
        {tabs.map(item => <a key={item.id} href={`#${item.id}`}
          onClick={navigate ? event => { event.preventDefault(); navigate(item.id); } : undefined}
          aria-current={section === item.id ? 'page' : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600 ${section === item.id ? 'bg-primary-50 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200' : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'}`}>
          <item.icon size={21} aria-hidden="true" />
          <span>{item.label}</span>
        </a>)}
      </div>
    </nav>
  </div>;
}
