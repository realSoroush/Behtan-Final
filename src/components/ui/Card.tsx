import { type ReactNode } from 'react';

// ============================================================================
// Card
// ============================================================================

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      className={`bg-white dark:bg-neutral-900 rounded-3xl shadow-sm border border-neutral-100 dark:border-neutral-800 p-5 ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {children}
    </div>
  );
}

// ============================================================================
// OptionCard — selectable card used throughout the onboarding steps
// ============================================================================

interface OptionCardProps {
  selected: boolean;
  onClick: () => void;
  icon?: ReactNode;
  label: string;
  description?: string;
  className?: string;
  disabled?: boolean;
}

export function OptionCard({ selected, onClick, icon, label, description, className = '', disabled = false }: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        relative w-full flex items-center gap-4 border-2 rounded-2xl p-4 text-right
        transition-all duration-200 cursor-pointer
        ${
          selected
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-700 bg-white dark:bg-neutral-900'
        }
        ${disabled ? 'cursor-not-allowed opacity-45' : ''}
        ${className}
      `}
    >
      {icon && (
        <span
          className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-xl
            ${selected ? 'bg-primary-500 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'}`}
        >
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold ${selected ? 'text-primary-700 dark:text-primary-300' : 'text-neutral-800 dark:text-neutral-100'}`}>
          {label}
        </p>
        {description && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">{description}</p>
        )}
      </div>
      {selected && (
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </button>
  );
}

// ============================================================================
// CheckboxCard — multi-select variant
// ============================================================================

interface CheckboxCardProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: ReactNode;
  label: string;
  description?: string;
}

export function CheckboxCard({ checked, onChange, icon, label, description }: CheckboxCardProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`
        w-full flex items-center gap-4 border-2 rounded-2xl p-4 text-right
        transition-all duration-200
        ${
          checked
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
            : 'border-neutral-200 dark:border-neutral-700 hover:border-primary-300 bg-white dark:bg-neutral-900'
        }
      `}
    >
      <span
        className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors
          ${checked ? 'bg-primary-500 border-primary-500' : 'border-neutral-300 dark:border-neutral-600'}`}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {icon && <span className="text-xl">{icon}</span>}
      <div className="flex-1 text-right">
        <p className="font-semibold text-neutral-800 dark:text-neutral-100">{label}</p>
        {description && <p className="text-sm text-neutral-500 mt-0.5">{description}</p>}
      </div>
    </button>
  );
}
