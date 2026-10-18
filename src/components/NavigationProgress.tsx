import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';

type ProgressState = 'idle' | 'loading' | 'complete';

const MIN_VISIBLE_MS = 220;
const COMPLETE_VISIBLE_MS = 170;
const FALLBACK_MS = 8000;

function currentBrowserPath() {
  return `${window.location.pathname}${window.location.search}`;
}

export default function NavigationProgress() {
  const [location, setLocation] = useLocation();
  const [state, setState] = useState<ProgressState>('idle');
  const lastPathRef = useRef<string | null>(null);
  const isActiveRef = useRef(false);
  const startedAtRef = useRef(0);
  const fallbackTimerRef = useRef<number | null>(null);
  const completeTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
    if (completeTimerRef.current !== null) window.clearTimeout(completeTimerRef.current);
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    fallbackTimerRef.current = null;
    completeTimerRef.current = null;
    hideTimerRef.current = null;
  }, []);

  const finishProgress = useCallback(() => {
    if (!isActiveRef.current) return;

    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    const remainingMinimum = Math.max(
      0,
      MIN_VISIBLE_MS - (performance.now() - startedAtRef.current),
    );

    completeTimerRef.current = window.setTimeout(() => {
      setState('complete');
      completeTimerRef.current = null;

      hideTimerRef.current = window.setTimeout(() => {
        isActiveRef.current = false;
        setState('idle');
        hideTimerRef.current = null;
      }, COMPLETE_VISIBLE_MS);
    }, remainingMinimum);
  }, []);

  const startProgress = useCallback(() => {
    clearTimers();
    isActiveRef.current = true;
    startedAtRef.current = performance.now();
    setState('loading');
    fallbackTimerRef.current = window.setTimeout(finishProgress, FALLBACK_MS);
  }, [clearTimers, finishProgress]);

  useEffect(() => {
    startProgress();

    const handleInitialLoad = () => {
      finishProgress();
    };

    if (document.readyState === 'complete') {
      const timer = window.setTimeout(finishProgress, 350);
      return () => window.clearTimeout(timer);
    } else {
      window.addEventListener('load', handleInitialLoad);
      const timer = window.setTimeout(finishProgress, 1200);
      return () => {
        window.removeEventListener('load', handleInitialLoad);
        window.clearTimeout(timer);
      };
    }
  }, [startProgress, finishProgress]);

  useEffect(() => {
    const currentPath = currentBrowserPath();

    if (lastPathRef.current === null) {
      lastPathRef.current = currentPath;
      return;
    }

    if (lastPathRef.current !== currentPath) {
      lastPathRef.current = currentPath;
      finishProgress();
    }
  }, [location, finishProgress]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      const link = target instanceof Element
        ? target.closest<HTMLAnchorElement>('a[href]')
        : null;

      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) {
        return;
      }

      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      const destinationPath = `${destination.pathname}${destination.search}`;
      const currentPath = currentBrowserPath();

      if (event.defaultPrevented) {
        // Wouter links have already updated history by the time this bubbles here.
        if (destinationPath === currentPath && currentPath !== lastPathRef.current) {
          startProgress();
        }
        return;
      }

      // Leave same-page anchors to the browser so normal in-page scrolling works.
      if (destinationPath === currentPath) return;

      event.preventDefault();
      startProgress();
      setLocation(`${destination.pathname}${destination.search}${destination.hash}`);
    };

    const handlePopState = () => {
      const currentPath = currentBrowserPath();
      if (lastPathRef.current !== null && currentPath !== lastPathRef.current) {
        startProgress();
      }
    };

    document.addEventListener('click', handleClick);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleClick);
      window.removeEventListener('popstate', handlePopState);
      clearTimers();
      isActiveRef.current = false;
    };
  }, [clearTimers, setLocation, startProgress]);

  if (state === 'idle') return null;

  return (
    <div className="navigation-progress" data-state={state} aria-hidden="true">
      <span className="navigation-progress__bar" />
    </div>
  );
}
