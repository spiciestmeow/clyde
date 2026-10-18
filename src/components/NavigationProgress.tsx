import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { refreshActiveData } from '../lib/dataRefresh';

declare global {
  interface Window {
    __vcomicsNavigationProgress?: {
      initialized: boolean;
      trigger: () => void;
      start: () => void;
      done: () => void;
    };
  }
}

function getGlobalProgress() {
  if (typeof window === 'undefined') return null;
  const w = window;

  if (!w.__vcomicsNavigationProgress) {
    let seqId = 0;
    let activeTimers: number[] = [];

    const clearAllTimers = () => {
      for (let i = 0; i < activeTimers.length; i++) {
        clearTimeout(activeTimers[i]);
        clearInterval(activeTimers[i]);
      }
      activeTimers = [];
    };

    const addTimer = (id: number) => {
      activeTimers.push(id);
      return id;
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

    const setScale = (ratio: number, instant?: boolean) => {
      const bar = getBar();
      if (instant) {
        bar.style.transition = 'none';
        bar.style.transform = `scaleX(${Math.max(0, Math.min(ratio, 1))})`;
        void bar.offsetWidth;
        bar.style.transition = '';
      } else {
        bar.style.transform = `scaleX(${Math.max(0, Math.min(ratio, 1))})`;
      }
    };

    const trigger = () => {
      const currentSeq = ++seqId;
      clearAllTimers();

      const bar = getBar();
      bar.style.opacity = '1';
      setScale(0, true);

      window.requestAnimationFrame(() => {
        if (seqId !== currentSeq) return;
        setScale(0.38, false);
      });

      addTimer(
        window.setTimeout(() => {
          if (seqId !== currentSeq) return;
          setScale(0.78, false);
        }, 110)
      );

      addTimer(
        window.setTimeout(() => {
          if (seqId !== currentSeq) return;
          setScale(1.0, false);
        }, 240)
      );

      addTimer(
        window.setTimeout(() => {
          if (seqId !== currentSeq) return;
          bar.style.opacity = '0';
        }, 380)
      );

      addTimer(
        window.setTimeout(() => {
          if (seqId !== currentSeq) return;
          setScale(0, true);
        }, 520)
      );
    };

    const start = () => {
      const currentSeq = ++seqId;
      clearAllTimers();

      const bar = getBar();
      bar.style.opacity = '1';
      setScale(0, true);

      window.requestAnimationFrame(() => {
        if (seqId !== currentSeq) return;
        setScale(0.2, false);
      });

      let val = 0.2;
      const trickle = window.setInterval(() => {
        if (seqId !== currentSeq) return;
        val += val < 0.7 ? 0.08 : val < 0.88 ? 0.03 : 0.008;
        setScale(Math.min(val, 0.92), false);
      }, 180);
      addTimer(trickle);

      addTimer(
        window.setTimeout(() => {
          if (seqId !== currentSeq) return;
          done();
        }, 1800)
      );
    };

    const done = () => {
      const currentSeq = ++seqId;
      clearAllTimers();

      const bar = getBar();
      setScale(1.0, false);

      addTimer(
        window.setTimeout(() => {
          if (seqId !== currentSeq) return;
          bar.style.opacity = '0';
        }, 180)
      );

      addTimer(
        window.setTimeout(() => {
          if (seqId !== currentSeq) return;
          setScale(0, true);
        }, 360)
      );
    };

    w.__vcomicsNavigationProgress = {
      initialized: true,
      trigger,
      start,
      done,
    };
  }

  return w.__vcomicsNavigationProgress;
}

export function triggerNavigationProgress() {
  getGlobalProgress()?.trigger();
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

  // Initial page mount / refresh: complete progress smoothly
  useEffect(() => {
    const progress = getGlobalProgress();
    const timer = window.setTimeout(() => {
      progress?.done();
    }, 380);

    return () => window.clearTimeout(timer);
  }, []);

  // Every route change or redirect in wouter
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    const progress = getGlobalProgress();
    // Complete the progress smoothly when route renders
    const timer = window.setTimeout(() => {
      progress?.done();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [location]);

  // Intercept all internal clicks: supports infinite rapid tapping on any menu link!
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

      // If user taps the active route link, scroll smoothly to top and re-fetch real data from Supabase
      if (destPath === currPath && destination.search === window.location.search) {
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        void refreshActiveData();
      }

      // Every tap resets immediately from 0, shoots across, and never freezes
      const progress = getGlobalProgress();
      progress?.trigger();
    };

    const handlePopState = () => {
      const progress = getGlobalProgress();
      progress?.trigger();
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
