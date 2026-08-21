import { type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';

// ============================================================================
// Input
// ============================================================================

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string;
  suffix?: string;
  startIcon?: ReactNode;
}

export function Input({ label, error, suffix, startIcon, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {startIcon && (
          <span className="absolute right-3 text-neutral-400 pointer-events-none">{startIcon}</span>
        )}
        <input
          className={`
            w-full bg-neutral-50 dark:bg-neutral-800 border
            ${error ? 'border-red-400' : 'border-neutral-200 dark:border-neutral-700'}
            rounded-2xl py-3.5 text-right outline-none
            focus:ring-2 focus:ring-primary-500 focus:border-transparent
            transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500
            ${startIcon ? 'pr-10 pl-4' : 'px-4'}
            ${suffix ? 'pl-14' : ''}
            ${className}
          `}
          {...props}
        />
        {suffix && (
          <span className="absolute left-4 text-sm text-neutral-500 dark:text-neutral-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

// ============================================================================
// Select
// ============================================================================

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export function Select({ label, error, options, placeholder, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          {label}
        </label>
      )}
      <select
        className={`
          w-full bg-neutral-50 dark:bg-neutral-800 border
          ${error ? 'border-red-400' : 'border-neutral-200 dark:border-neutral-700'}
          rounded-2xl py-3.5 px-4 text-right outline-none
          focus:ring-2 focus:ring-primary-500 focus:border-transparent
          transition-all appearance-none cursor-pointer
          text-neutral-900 dark:text-neutral-100
          ${className}
        `}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

// ============================================================================
// TimeInput — wraps <input type="time"> with RTL label
// ============================================================================

interface TimeInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

export function TimeInput({ label, value, onChange }: TimeInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">{label}</label>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl py-2.5 px-3 text-center outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-sm"
        dir="ltr"
      />
    </div>
  );
}
