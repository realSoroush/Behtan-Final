import type { ReactNode } from 'react';

/** The static companion keeps loading states independent of the Rive runtime. */
export function LoadingMascot() {
  return <img className="app-loading__mascot" src="/mascot/behtan-rest.svg" alt="" width={52} height={61} aria-hidden="true" />;
}

export function AppLoading({ label, variant = 'panel', progress, children }: {
  label: string;
  variant?: 'page' | 'panel' | 'inline';
  progress?: { value: number; max: number };
  children?: ReactNode;
}) {
  return <div className={`app-loading app-loading--${variant}`} dir="rtl">
    <div className="app-loading__content" role="status">
      <LoadingMascot />
      <div><strong>{label}</strong>{children}</div>
    </div>
    {progress ? <progress className="app-loading__progress" aria-label={label} value={progress.value} max={progress.max} />
      : variant !== 'inline' && <div className="app-loading__skeleton" aria-hidden="true"><i /><i /><i /></div>}
  </div>;
}
