// Dev-only browser test entry. Vite's production entry never imports this file.
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "../../src/theme/ThemeProvider";
import { DashboardPage } from "../../src/components/dashboard/DashboardPage";
import "../../src/index.css";
createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <DashboardPage />
  </ThemeProvider>,
);
