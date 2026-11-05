import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { queryClient } from './lib/queryClient';

import './index.css';

// Prevent right-click, dragging, and mobile long-press menus on images
if (typeof window !== 'undefined') {
  const isImageOrCover = (target: HTMLElement | null) => {
    return !!(
      target &&
      (target.tagName === 'IMG' ||
        target.closest('.release-cover') ||
        target.closest('.series-cover-frame') ||
        target.closest('.continue-card__cover') ||
        target.closest('.hero-slide-image'))
    );
  };

  document.addEventListener('contextmenu', (e) => {
    if (isImageOrCover(e.target as HTMLElement | null)) {
      e.preventDefault();
    }
  });

  document.addEventListener('dragstart', (e) => {
    if (isImageOrCover(e.target as HTMLElement | null)) {
      e.preventDefault();
    }
  });

  // Mobile long-press suppression
  let touchTimer: number | null = null;
  document.addEventListener(
    'touchstart',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (isImageOrCover(target)) {
        touchTimer = window.setTimeout(() => {
          // If held long enough to be a context menu trigger on mobile
        }, 400);
      }
    },
    { passive: true }
  );

  document.addEventListener('touchend', () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
  });

  document.addEventListener('touchcancel', () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
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
