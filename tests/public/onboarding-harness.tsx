import {createRoot} from 'react-dom/client';
import {ThemeProvider} from '../../src/theme/ThemeProvider';
import {OnboardingWizard} from '../../src/components/onboarding/OnboardingWizard';
import '../../src/index.css';
createRoot(document.getElementById('root')!).render(<ThemeProvider><OnboardingWizard onComplete={()=>{document.documentElement.dataset.completed='true';}}/></ThemeProvider>);
