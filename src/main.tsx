import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { queryClient } from './lib/queryClient';

import './index.css';

// Prevent right-click and dragging on all images (Anti-save protection)
if (typeof window !== 'undefined') {
  document.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'IMG' || target.closest('.release-cover') || target.closest('.series-cover-frame') || target.closest('.hero-slide-image'))) {
      e.preventDefault();
    }
  });

  document.addEventListener('dragstart', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'IMG' || target.closest('.release-cover') || target.closest('.series-cover-frame'))) {
      e.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </QueryClientProvider>,
);
