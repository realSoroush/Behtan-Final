import { StrictMode } from 'react';
import { createRoot,hydrateRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { ThemeProvider } from '@/theme/ThemeProvider';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found in index.html');

const tree=(
  <StrictMode>
    <ThemeProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </ThemeProvider>
  </StrictMode>
);
if(root.hasChildNodes()&&!window.location.hash&&!new URLSearchParams(window.location.search).has('payment'))hydrateRoot(root,tree);else createRoot(root).render(tree);
