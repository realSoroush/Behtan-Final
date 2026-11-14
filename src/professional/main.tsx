import { lazy, Suspense } from 'react';
import { AppLoading } from '@/components/ui/AppLoading';
import { createRoot } from "react-dom/client";
import "../index.css";
import "./pro.css";
import "./workspace.css";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { ProApp } from "./ProApp";
const ExerciseGuide = lazy(() => import('../training/Guide').then(m => ({ default: m.ExerciseGuide })));
const exercise = new URLSearchParams(window.location.search).get('exercise');
document.title = "به‌تن حرفه‌ای | پنل برنامه‌دهی";
createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <AppErrorBoundary>
      {exercise !== null ? <Suspense fallback={<AppLoading variant="page" label="در حال بازکردن راهنمای حرکت…" />}><ExerciseGuide id={exercise} /></Suspense> : <ProApp />}
    </AppErrorBoundary>
  </ThemeProvider>,
);
