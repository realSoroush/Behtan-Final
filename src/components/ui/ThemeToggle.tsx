import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/theme/ThemeProvider';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? 'تغییر به تم روشن' : 'تغییر به تم تیره';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white/80 text-neutral-600 shadow-sm backdrop-blur transition-all hover:bg-neutral-100 hover:text-neutral-900 active:scale-95 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white ${className}`}
    >
      {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
