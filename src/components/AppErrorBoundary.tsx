import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { APP_NAME_EN, APP_NAME_FA } from '@/constants/brand';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Unhandled ${APP_NAME_EN} UI error:`, error, info);
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center px-5" dir="rtl">
        <div className="w-full max-w-md rounded-3xl border border-red-100 bg-white p-6 text-center shadow-sm dark:border-red-950/60 dark:bg-neutral-900">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-950/40">
            <AlertTriangle size={24} />
          </div>
          <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            {APP_NAME_FA} با یک خطای غیرمنتظره مواجه شد
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-500 dark:text-neutral-400">
            اطلاعات ذخیره‌شده شما از بین نرفته است. صفحه را دوباره بارگذاری کنید و ادامه دهید.
          </p>
          <button
            type="button"
            onClick={this.reload}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-500 px-5 py-3.5 font-semibold text-white transition-colors hover:bg-primary-600"
          >
            <RefreshCw size={18} />
            بارگذاری مجدد
          </button>
        </div>
      </main>
    );
  }
}
