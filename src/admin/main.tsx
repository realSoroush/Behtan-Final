import { createRoot } from 'react-dom/client';
import '../index.css';
import './admin.css';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AdminApp } from './AdminApp';
document.title = 'مدیریت به‌تن';
createRoot(document.getElementById('root')!).render(<ThemeProvider><AppErrorBoundary><AdminApp /></AppErrorBoundary></ThemeProvider>);
