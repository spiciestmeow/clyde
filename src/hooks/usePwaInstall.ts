import { useEffect, useState } from 'react';

// Store deferred beforeinstallprompt across the app
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((listener) => listener());
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    promptListeners.forEach((listener) => listener());
  });
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState<boolean>(() => Boolean(deferredPrompt));
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');

  useEffect(() => {
    const handlePromptChange = () => {
      setCanInstall(Boolean(deferredPrompt));
    };

    promptListeners.add(handlePromptChange);

    // Check if running in standalone mode (already installed)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
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
      promptListeners.delete(handlePromptChange);
    };
  }, []);

  const triggerInstall = async (mode: 'standalone' | 'fullscreen' = 'standalone'): Promise<boolean> => {
    if (mode === 'fullscreen' && typeof document !== 'undefined') {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          void document.documentElement.requestFullscreen();
        }
      } catch {
        // Fullscreen request may require user gesture
      }
    }

    if (!deferredPrompt) {
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        deferredPrompt = null;
        setCanInstall(false);
        return true;
      }
    } catch (err) {
      console.warn('Install prompt failed:', err);
    }
    return false;
  };

  return {
    canInstall,
    isInstalled,
    platform,
    triggerInstall,
  };
}
