import { LogOut, ShieldAlert } from 'lucide-react';
import { APP_LOGO_PATH, APP_NAME_FA } from '@/constants/brand';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import type { MedicalEligibilityResult } from '@/utils/medicalEligibility';

interface MedicalSafetyBlockedPageProps {
  eligibility: MedicalEligibilityResult;
  onReviewAnswers: () => void;
  onSignOut: () => void | Promise<void>;
}

export function MedicalSafetyBlockedPage({
  eligibility,
  onReviewAnswers,
  onSignOut,
}: MedicalSafetyBlockedPageProps) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-md items-center justify-between px-5 py-3">
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void onSignOut()}
              aria-label="خروج از حساب"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <LogOut size={19} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-neutral-900 dark:text-neutral-100">{APP_NAME_FA}</span>
            <img src={APP_LOGO_PATH} alt={`لوگوی ${APP_NAME_FA}`} className="h-8 w-8 object-contain" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-10">
        <div className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/60 dark:bg-neutral-900">
          <ShieldAlert size={48} className="mx-auto text-red-500" />
          <h1 className="mt-4 text-center text-xl font-extrabold text-neutral-900 dark:text-neutral-100">
            برنامه غذایی خودکار فعال نشد
          </h1>
          <p className="mt-3 text-center text-sm leading-6 text-neutral-600 dark:text-neutral-300">
            این پیام تشخیص پزشکی نیست. نسخه فعلی به‌تن برای شرایط زیر شخصی‌سازی بالینی کافی ندارد، بنابراین برای حفظ ایمنی برنامه عمومی تولید نمی‌کند.
          </p>

          <ul className="mt-5 space-y-3">
            {eligibility.blockers.map((blocker) => (
              <li key={blocker.code} className="rounded-2xl bg-red-50 p-3 dark:bg-red-950/30">
                <p className="font-semibold text-red-800 dark:text-red-200">{blocker.title}</p>
                <p className="mt-1 text-sm leading-6 text-red-700 dark:text-red-300">{blocker.detail}</p>
              </li>
            ))}
          </ul>

          <p className="mt-5 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
            برنامه مناسب باید با توجه به سوابق پزشکی، داروها و در صورت نیاز نتایج آزمایش‌ها توسط پزشک یا متخصص تغذیه دارای صلاحیت تنظیم شود.
          </p>

          <Button variant="secondary" className="mt-6" onClick={onReviewAnswers}>
            بازبینی پاسخ‌ها
          </Button>
        </div>
      </main>
    </div>
  );
}
