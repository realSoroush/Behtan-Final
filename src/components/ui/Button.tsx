import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
  fullWidth?: boolean;
}

const VARIANTS = {
  primary:
    'bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white shadow-sm shadow-primary-200 dark:shadow-primary-900/30',
  secondary:
    'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200',
  ghost: 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800',
  danger: 'bg-red-500 hover:bg-red-600 text-white',
};

const SIZES = {
  sm: 'text-sm py-2 px-4 rounded-xl',
  md: 'text-base py-3.5 px-6 rounded-2xl',
  lg: 'text-lg py-4 px-8 rounded-2xl font-bold',
};

export function Button({
  variant = 'primary',
  size = 'lg',
  loading = false,
  children,
  fullWidth = true,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 font-semibold
        transition-all duration-200
        disabled:opacity-40 disabled:cursor-not-allowed
        ${VARIANTS[variant]}
        ${SIZES[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  );
}
