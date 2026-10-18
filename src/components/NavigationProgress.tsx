import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

declare global {
  interface Window {
    __vcomicsNavigationProgress?: {
      initialized: boolean;
      active: boolean;
      value: number;
      trickleTimer: number;
      hideTimer: number;
      resetTimer: number;
      safetyTimer: number;
      start: () => void;
      done: () => void;
    };
  }
}

function getGlobalProgress() {
  if (typeof window === 'undefined') return null;
  const w = window;
  if (!w.__vcomicsNavigationProgress) {
    const state = {
      initialized: true,
      active: false,
      value: 0,
      trickleTimer: 0,
      hideTimer: 0,
      resetTimer: 0,
      safetyTimer: 0,
      start: () => {},
      done: () => {},
    };

    const getBar = () => {
      let bar = document.getElementById('vcomics-navigation-progress');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'vcomics-navigation-progress';
        bar.setAttribute('aria-hidden', 'true');
        (document.body || document.documentElement).appendChild(bar);
      }
      return bar;
    };

    const clearTimers = () => {
      if (state.trickleTimer) { window.clearInterval(state.trickleTimer); state.trickleTimer = 0; }
      if (state.hideTimer) { window.clearTimeout(state.hideTimer); state.hideTimer = 0; }
      if (state.resetTimer) { window.clearTimeout(state.resetTimer); state.resetTimer = 0; }
      if (state.safetyTimer) { window.clearTimeout(state.safetyTimer); state.safetyTimer = 0; }
    };

    const setProgress = (val: number, instant?: boolean) => {
      state.value = Math.max(0, Math.min(val, 100));
      const bar = getBar();
      if (instant) {
        bar.style.transition = 'none';
        bar.style.transform = `scaleX(${state.value / 100})`;
        void bar.offsetWidth;
        bar.style.transition = '';
      } else {
        bar.style.transform = `scaleX(${state.value / 100})`;
      }
    };

    state.start = () => {
      clearTimers();
      state.active = true;
      const bar = getBar();
      bar.style.opacity = '1';
      setProgress(0, true);

      window.requestAnimationFrame(() => {
        if (!state.active) return;
        setProgress(15);
      });

      state.trickleTimer = window.setInterval(() => {
        if (!state.active) return;
        const next = state.value + (state.value < 70 ? 8 : state.value < 88 ? 3 : 0.75);
        setProgress(Math.min(next, 92));
      }, 200);

      state.safetyTimer = window.setTimeout(() => {
        if (state.active) state.done();
      }, 2500);
    };

    state.done = () => {
      if (!state.active) return;
      state.active = false;
      if (state.trickleTimer) { window.clearInterval(state.trickleTimer); state.trickleTimer = 0; }
      if (state.safetyTimer) { window.clearTimeout(state.safetyTimer); state.safetyTimer = 0; }

      setProgress(100);

      state.hideTimer = window.setTimeout(() => {
        const bar = getBar();
        bar.style.opacity = '0';
        state.resetTimer = window.setTimeout(() => {
          setProgress(0, true);
          state.value = 0;
        }, 180);
      }, 220);
    };

    w.__vcomicsNavigationProgress = state;
  }
  return w.__vcomicsNavigationProgress;
}

export function startNavigationProgress() {
  getGlobalProgress()?.start();
}

export function finishNavigationProgress() {
  getGlobalProgress()?.done();
}

export default function NavigationProgress() {
  const [location] = useLocation();
  const isFirstMountRef = useRef(true);
  const routeTimerRef = useRef<number | null>(null);

  // Initial page mount / refresh: complete progress smoothly
  useEffect(() => {
    const progress = getGlobalProgress();
    if (!progress?.active) {
      progress?.start();
    }
    const timer = window.setTimeout(() => {
      progress?.done();
    }, 400);

    return () => window.clearTimeout(timer);
  }, []);

  // Every route change or redirect in wouter
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    const progress = getGlobalProgress();
    if (routeTimerRef.current !== null) {
      window.clearTimeout(routeTimerRef.current);
    }

    // Ensure progress is started for this transition
    if (!progress?.active) {
      progress?.start();
    }

    // Finish when the new view is rendered
    routeTimerRef.current = window.setTimeout(() => {
      progress?.done();
      routeTimerRef.current = null;
    }, 280);

    return () => {
      if (routeTimerRef.current !== null) {
        window.clearTimeout(routeTimerRef.current);
        routeTimerRef.current = null;
      }
    };
  }, [location]);

  // Intercept clicks on links
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

      const href = link.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin) return;

      const normalize = (p: string) => p.replace(/\/$/, '') || '/';
      const destPath = normalize(destination.pathname);
      const currPath = normalize(window.location.pathname);

      // If user double-taps or clicks the already active route link, do not trigger an orphan progress
      if (destPath === currPath && destination.search === window.location.search) {
        return;
      }

      // Start progress immediately on internal route link click
      getGlobalProgress()?.start();
    };

    const handlePopState = () => {
      const progress = getGlobalProgress();
      progress?.start();
      window.setTimeout(() => {
        progress?.done();
      }, 280);
    };

    document.addEventListener('click', handleClick, { capture: true });
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener('popstate', handlePopState);
      if (routeTimerRef.current !== null) {
        window.clearTimeout(routeTimerRef.current);
      }
    };
  }, []);

  return null;
}
