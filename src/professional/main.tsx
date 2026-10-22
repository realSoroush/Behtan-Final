import {ExerciseGuide} from '../training/Guide';
import { createRoot } from "react-dom/client";
import "../index.css";
import "./pro.css";
import "./workspace.css";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { ProApp } from "./ProApp";
document.title = "به‌تن حرفه‌ای | پنل برنامه‌دهی";
createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <AppErrorBoundary>
      {new URLSearchParams(window.location.search).has('exercise')?<ExerciseGuide id={new URLSearchParams(window.location.search).get('exercise')||''}/>:<ProApp />}
    </AppErrorBoundary>
  </ThemeProvider>,
);
