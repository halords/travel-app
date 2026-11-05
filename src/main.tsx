import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import App from './App';
import './styles.css';
import './theme.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div className="app-error">
          <img src="/favicon.svg" alt="Roam" width={48} />
          <h1>A small detour.</h1>
          <p>Roam couldn’t open this view. Your saved trips are still on this device.</p>
          <button className="button primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      );
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
