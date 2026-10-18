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

    const setValue = (val: number) => {
      state.value = Math.max(state.value, Math.min(val, 100));
      const bar = getBar();
      bar.style.opacity = '1';
      bar.style.transform = `scaleX(${state.value / 100})`;
    };

    const clearTimers = () => {
      if (state.trickleTimer) {
        window.clearInterval(state.trickleTimer);
        state.trickleTimer = 0;
      }
      if (state.hideTimer) {
        window.clearTimeout(state.hideTimer);
        state.hideTimer = 0;
      }
    };

    state.start = () => {
      clearTimers();
      state.active = true;
      state.value = 0;
      setValue(15);
      state.trickleTimer = window.setInterval(() => {
        if (!state.active) return;
        const next = state.value + (state.value < 70 ? 8 : state.value < 88 ? 3 : 0.75);
        setValue(Math.min(next, 92));
      }, 200);
    };

    state.done = () => {
      if (!state.active) return;
      state.active = false;
      if (state.trickleTimer) {
        window.clearInterval(state.trickleTimer);
        state.trickleTimer = 0;
      }
      setValue(100);
      state.hideTimer = window.setTimeout(() => {
        const bar = getBar();
        bar.style.opacity = '0';
        bar.style.transform = 'scaleX(0)';
        state.value = 0;
        state.hideTimer = 0;
      }, 200);
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

  // Initial page mount / refresh: finish progress after a clean display window
  useEffect(() => {
    const progress = getGlobalProgress();
    // If progress isn't already active from index.html, start it
    if (!progress?.active) {
      progress?.start();
    }
    const timer = window.setTimeout(() => {
      progress?.done();
    }, 450);

    return () => window.clearTimeout(timer);
  }, []);

  // Every route change or redirect in wouter
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    const progress = getGlobalProgress();
    progress?.start();

    const timer = window.setTimeout(() => {
      progress?.done();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [location]);

  // Intercept all internal link clicks and popstate (browser back/forward)
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

      // Start progress immediately on internal link click
      getGlobalProgress()?.start();
    };

    const handlePopState = () => {
      const progress = getGlobalProgress();
      progress?.start();
      window.setTimeout(() => {
        progress?.done();
      }, 350);
    };

    document.addEventListener('click', handleClick, { capture: true });
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  return null;
}
