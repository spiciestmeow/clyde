import { useEffect, useRef, useState } from 'react';

type SpiderPhase = 'idle' | 'dropping' | 'climbing';

export default function HeroSpider({ className = '' }: { className?: string }) {
  const [phase, setPhase] = useState<SpiderPhase>('idle');
  const climbTimer = useRef<number | null>(null);
  const resetTimer = useRef<number | null>(null);
  const chitterTimer = useRef<number | null>(null);
  const sounds = useRef<{ drop: HTMLAudioElement; chitter: HTMLAudioElement } | null>(null);

  useEffect(() => () => {
    if (climbTimer.current !== null) window.clearTimeout(climbTimer.current);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    if (chitterTimer.current !== null) window.clearTimeout(chitterTimer.current);
  }, []);

  const getSounds = () => {
    if (!sounds.current) {
      const drop = new Audio('https://vortexscans.org/theme/sounds/halloween-spider-drop.mp3');
      const chitter = new Audio('https://vortexscans.org/theme/sounds/halloween-spider-chitter.mp3');
      drop.preload = 'auto';
      drop.volume = 0.18;
      chitter.preload = 'auto';
      chitter.volume = 0.24;
      sounds.current = { drop, chitter };
    }
    return sounds.current;
  };

  const preloadSounds = () => {
    const { drop, chitter } = getSounds();
    drop.load();
    chitter.load();
  };

  const playSound = (audio: HTMLAudioElement) => {
    audio.pause();
    if (audio.readyState > 0) audio.currentTime = 0;
    void audio.play().catch((error: unknown) => {
      console.info('Spider sound could not play:', error);
    });
  };

  const dropSpider = () => {
    if (phase !== 'idle') return;
    setPhase('dropping');
    const { drop, chitter } = getSounds();
    playSound(drop);
    chitterTimer.current = window.setTimeout(() => playSound(chitter), 600);
    climbTimer.current = window.setTimeout(() => {
      setPhase('climbing');
      resetTimer.current = window.setTimeout(() => {
        setPhase('idle');
        climbTimer.current = null;
        resetTimer.current = null;
        chitterTimer.current = null;
      }, 1600);
    }, 1500);
  };

  return (
    <div className={`hero-spider${className ? ` ${className}` : ''}${phase === 'idle' ? '' : ` is-${phase}`}`}>
      <span className="hero-spider__thread" aria-hidden="true" />
      <button
        type="button"
        className="hero-spider__button"
        aria-label={phase === 'idle' ? 'Make the spider drop down' : `Spider is ${phase}`}
        title="Click the spider"
        aria-disabled={phase !== 'idle'}
        onPointerEnter={preloadSounds}
        onPointerDown={preloadSounds}
        onClick={dropSpider}
      >
        <img src="https://vortexscans.org/theme/img/halloween/spider.webp" alt="" draggable={false} />
      </button>
    </div>
  );
}
