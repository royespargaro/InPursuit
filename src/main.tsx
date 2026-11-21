import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PhaseAutoStart } from './components/PhaseAutoStart';
import { HabitProvider } from './context/HabitContext';
import './index.css';
import './styles/skin.css';
import './styles/responsive.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <HabitProvider>
        <PhaseAutoStart />
        <App />
      </HabitProvider>
    </ErrorBoundary>,
  );
}
