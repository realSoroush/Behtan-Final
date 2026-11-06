import { CalendarDays, ScanLine } from 'lucide-react';
import { getTehranDateKey } from '@/utils/dailyMealProgress';
import { addPlanDays } from '@/utils/mealPresentation';
import { MemberCompanion } from './MemberCompanion';
import { MemberHomeShell } from './MemberHomeShell';
import './member-home-skeleton.css';

export const memberTodayClass = 'max-w-md mx-auto px-4 py-5 space-y-4';

export function MemberEnergySkeleton({ title }: { title: string }) {
  return <section className="member-summary member-summary-v4 member-home-skeleton" aria-label={title} aria-busy="true">
    <div className="member-summary-top"><h2>{title}</h2><i className="home-placeholder home-placeholder--switch" aria-hidden="true" /></div>
    <div className="compact-energy-layout" aria-hidden="true">
      <div className="compact-energy-ring home-placeholder-ring"><i className="home-placeholder" /><i className="home-placeholder" /></div>
      <div className="compact-macros">
        {[0, 1, 2].map(index => <div key={index}><div><i className="home-placeholder" /><i className="home-placeholder" /></div><i className="home-placeholder member-macro-track" /></div>)}
      </div>
    </div>
    <div className="compact-energy-note" aria-hidden="true"><i className="home-placeholder" /></div>
  </section>;
}

export function MemberMealSkeleton({ title }: { title: string }) {
  return <section className="member-next-section member-home-skeleton" aria-label={title} aria-busy="true">
    <div className="member-next-heading">
      <div><span className="member-eyebrow">برنامهٔ شخصی تو</span><h2>{title}</h2></div>
      <i className="home-placeholder home-placeholder--count" aria-hidden="true" />
    </div>
    <div className="member-meal-v3 home-placeholder-meal" aria-hidden="true">
      <div className="meal-visual-surface">
        <div className="meal-change-row"><i className="home-placeholder home-placeholder--change" /></div>
        <div className="meal-v3-hero">
          <div className="meal-v3-copy"><i className="home-placeholder" /><i className="home-placeholder" /><i className="home-placeholder" /></div>
          <div className="home-placeholder home-placeholder--plate" />
        </div>
      </div>
      <div className="meal-macro-chips"><i className="home-placeholder" /><i className="home-placeholder" /><i className="home-placeholder" /></div>
      <div className="meal-card-actions"><i className="home-placeholder" /><i className="home-placeholder" /></div>
      <div className="home-placeholder-ingredients">
        {[0, 1, 2].map(index => <div className="meal-ingredient-row" key={index}><i className="home-placeholder" /><div><i className="home-placeholder" /><i className="home-placeholder" /></div><i className="home-placeholder" /></div>)}
      </div>
    </div>
    <div className="member-plan-actions" aria-hidden="true"><div className="member-secondary"><CalendarDays size={19} /><i className="home-placeholder" /></div></div>
  </section>;
}

export function MemberScanEntry({ onClick, disabled }: { onClick?: () => void; disabled?: boolean }) {
  return <button type="button" className="food-scan-entry" disabled={disabled} onClick={onClick}>
    <ScanLine size={24} /><span><b>غذات رو چک کن</b><small>تخمین کالری از عکس، با امکان اصلاح مقدار</small></span><span>←</span>
  </button>;
}

export function MemberEnergyPolicyNote() {
  return <p className="member-muted">در هدف کاهش یا افزایش وزن، کالری پایه ثابت می‌ماند و روز تمرین بین وعده‌ها بازتوزیع می‌شود؛ در حفظ وزن، سیاست فعلی ۱۵۰ کالری اضافه می‌کند.</p>;
}

export function MemberHomePlaceholder() {
  const today = getTehranDateKey();
  return <MemberHomeShell>
    <div id="today-panel" className={memberTodayClass}>
      <MemberCompanion loading days={[today, addPlanDays(today, 1), addPlanDays(today, 2)]} selectedDate={today} />
      <MemberEnergyPolicyNote />
      <MemberEnergySkeleton title="انرژی امروز" />
      <MemberScanEntry disabled />
      <MemberMealSkeleton title="وعدهٔ بعدی" />
    </div>
  </MemberHomeShell>;
}
