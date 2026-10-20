import { createRoot } from "react-dom/client";
import "../index.css";
import "./pro.css";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { ProApp } from "./ProApp";
document.title = "به‌تن حرفه‌ای — محیط آزمایش";
createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <AppErrorBoundary>
      <ProApp />
    </AppErrorBoundary>
  </ThemeProvider>,
);
