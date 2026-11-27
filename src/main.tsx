import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HabitProvider } from './context/HabitContext';
import { LanguageProvider } from './context/LanguageContext';
import { MindWorkspaceProvider } from './modules/mind-architecture/context/MindWorkspaceContext';
import './index.css';
import './styles/skin.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <LanguageProvider>
        <HabitProvider>
          <MindWorkspaceProvider>
            <App />
          </MindWorkspaceProvider>
        </HabitProvider>
      </LanguageProvider>
    </ErrorBoundary>,
  );
}
