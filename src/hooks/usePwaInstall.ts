import { useEffect, useState } from 'react';

declare global {
  interface Window {
    deferredPwaPrompt?: {
      prompt(): Promise<void>;
      userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
      }>;
    } | null;
  }
}

export type InstallResult = {
  success: boolean;
  method: 'native' | 'manual' | 'reload';
};

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState<boolean>(() => {
    return typeof window !== 'undefined' && Boolean(window.deferredPwaPrompt);
  });
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');

  useEffect(() => {
    const checkPrompt = () => {
      if (typeof window !== 'undefined') {
        setCanInstall(Boolean(window.deferredPwaPrompt));
      }
    };

    checkPrompt();

    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.deferredPwaPrompt = e as unknown as Window['deferredPwaPrompt'];
      setCanInstall(true);
    };

    const onPromptAvailable = () => {
      setCanInstall(true);
    };

    const onAppInstalled = () => {
      window.deferredPwaPrompt = null;
      setCanInstall(false);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('clydee-pwa-prompt-available', onPromptAvailable);
    window.addEventListener('clydee-pwa-installed', onAppInstalled);
    window.addEventListener('appinstalled', onAppInstalled);

    // Check if running in standalone mode (already installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      Boolean((navigator as unknown as { standalone?: boolean }).standalone);
    setIsInstalled(isStandalone);

    // Detect user platform
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setPlatform('ios');
    } else if (/android/.test(ua)) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('clydee-pwa-prompt-available', onPromptAvailable);
      window.removeEventListener('clydee-pwa-installed', onAppInstalled);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const triggerInstall = async (mode: 'standalone' | 'fullscreen' = 'standalone'): Promise<InstallResult> => {
    // Each mode has its own manifest, chosen in index.html from the ?mode= query param.
    // If the page was loaded for the other mode, reload into the right one first so the
    // browser picks up that manifest and its install prompt.
    if (typeof window !== 'undefined') {
      const currentMode =
        new URLSearchParams(window.location.search).get('mode') === 'fullscreen' ? 'fullscreen' : 'standalone';
      if (currentMode !== mode) {
        const url = new URL(window.location.href);
        if (mode === 'fullscreen') {
          url.searchParams.set('mode', 'fullscreen');
        } else {
          url.searchParams.delete('mode');
        }
        window.location.replace(url.toString());
        return { success: false, method: 'reload' };
      }
    }

    const promptEvent = typeof window !== 'undefined' ? window.deferredPwaPrompt : null;
    if (promptEvent && typeof promptEvent.prompt === 'function') {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === 'accepted') {
          window.deferredPwaPrompt = null;
          setCanInstall(false);
          setIsInstalled(true);
          return { success: true, method: 'native' };
        }
        return { success: false, method: 'native' };
      } catch (err) {
        console.warn('Native install prompt error:', err);
      }
    }

    // Native beforeinstallprompt is not directly available (e.g. already triggered, iOS, or requires browser menu)
    return { success: false, method: 'manual' };
  };

  return {
    canInstall,
    isInstalled,
    platform,
    triggerInstall,
  };
}
