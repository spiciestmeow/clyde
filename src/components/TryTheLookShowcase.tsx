import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import type { SeriesRecord } from '../lib/seriesCatalog';
import './try-the-look-showcase.css';

const LOOK_IMAGES = ['2.webp', '5.webp', '4.webp', '6.webp', '3.webp', '2.webp'];
const TICK_MS = 6000;
const STEP_MS = 140;
const MAIN_SLOTS: Record<number, readonly [number, number, number, number, number, number, number]> = {
  [-3]: [15.7, 57, -22, .26, 7, 1, 90],
  [-2]: [4.7, 75, -15, .8, 3.2, 1, 60],
  [-1]: [20, 84, -4, 1, 4, 2, 30],
  0: [50, 94, 0, 1, 0, 3, 0],
  1: [79.4, 84, -4, 1, 4, 2, 30],
  2: [95.3, 75, -15, .8, 3.2, 1, 60],
  3: [84.3, 57, -22, .26, 7, 1, 90],
};
const GHOST_SLOTS = {
  leftOff: [9, 52, -25, 0, 8, 0, 90],
  rightOff: [91, 52, -25, 0, 8, 0, 90],
} as const;

type Visual = { slot: number; instant: boolean };
type ModelVisual = { main: Visual; left: Visual; right: Visual };
type Props = { series: (SeriesRecord & { spotlightImage?: string })[] };

function wrap(value: number, lowerBound: number, count: number): number {
  return ((value - lowerBound) % count + count) % count + lowerBound;
}

function mainVisual(slot: number, instant = false): Visual {
  return { slot, instant };
}

function ghostVisual(side: 'left' | 'right', on: boolean, instant = false): Visual {
  return { slot: on ? (side === 'left' ? -3 : 3) : side === 'left' ? -4 : 4, instant };
}

function slotStyle(slot: number, instant = false): CSSProperties {
  const values = slot === -4 ? GHOST_SLOTS.leftOff : slot === 4 ? GHOST_SLOTS.rightOff : MAIN_SLOTS[slot] || MAIN_SLOTS[0];
  const [x, height, ty, opacity, blur, zIndex, delay] = values;
  return {
    '--model-x': `${x}%`,
    '--model-height': `${height}%`,
    '--model-ty': `${ty}%`,
    '--model-opacity': opacity,
    '--model-blur': `${blur}px`,
    '--model-delay': `${delay}ms`,
    '--model-opacity-duration': opacity === 0 ? '.22s' : '.7s',
    zIndex,
    transition: instant ? 'none' : undefined,
  } as CSSProperties;
}

function getInitialPlaying(): boolean {
  return typeof window === 'undefined' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function TryTheLookShowcase({ series }: Props) {
  const items = useMemo(() => series.slice(0, LOOK_IMAGES.length), [series]);
  const itemSignature = items.map((item) => item.id).join(':');
  const [selected, setSelected] = useState(0);
  const [visuals, setVisuals] = useState<ModelVisual[]>([]);
  const [playing, setPlaying] = useState(getInitialPlaying);
  const [hovered, setHovered] = useState(false);
  const [pageHidden, setPageHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [modalOpen, setModalOpen] = useState(false);
  const activeRef = useRef(0);
  const selectedRef = useRef(0);
  const visualsRef = useRef<ModelVisual[]>([]);
  const itemsRef = useRef(items);
  const stepTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const pointerStartRef = useRef<number | null>(null);
  const draggedRef = useRef(false);
  itemsRef.current = items;

  const layout = useCallback((nextActive: number, direction: number, first = false) => {
    const list = itemsRef.current;
    const count = list.length;
    if (!count) return;
    const lowerBound = -Math.floor(count / 2);
    const oldVisuals = visualsRef.current;
    const finalVisuals: ModelVisual[] = [];
    const instantVisuals: ModelVisual[] = [];
    let needsFrame = false;

    list.forEach((_, index) => {
      const targetSlot = wrap(index - nextActive, lowerBound, count);
      const old = oldVisuals[index];
      if (first || !old) {
        const parked = targetSlot === lowerBound;
        const nextModel = {
          main: mainVisual(targetSlot, false),
          left: ghostVisual('left', parked && targetSlot === 3),
          right: ghostVisual('right', parked && targetSlot === -3),
        };
        finalVisuals.push(nextModel);
        instantVisuals.push({
          main: mainVisual(targetSlot, true),
          left: ghostVisual('left', parked && targetSlot === 3, true),
          right: ghostVisual('right', parked && targetSlot === -3, true),
        });
        needsFrame = true;
        return;
      }

      const previousSlot = old.main.slot;
      let target = targetSlot;
      let start = previousSlot;
      if (targetSlot === lowerBound && direction < 0 && Math.abs(previousSlot) < 3) target = 3;
      if (targetSlot > lowerBound || target === 3) {
        if (direction > 0 && previousSlot === -3) start = 3;
        if (direction < 0 && previousSlot === 3) start = -3;
      }
      const teleported = start !== previousSlot;
      const finalMain = mainVisual(target, false);
      let finalLeft = old.left;
      let finalRight = old.right;
      let instantLeft = old.left;
      let instantRight = old.right;
      const parked = targetSlot === lowerBound;

      if (!first && Math.abs(previousSlot) === 3 && Math.abs(target) !== 3) {
        const leavingSide = previousSlot === -3 ? 'left' : 'right';
        if (teleported) {
          if (leavingSide === 'left') {
            instantLeft = ghostVisual('left', true, true);
            finalLeft = ghostVisual('left', false, false);
            instantRight = ghostVisual('right', false, true);
            finalRight = ghostVisual('right', false, false);
          } else {
            instantRight = ghostVisual('right', true, true);
            finalRight = ghostVisual('right', false, false);
            instantLeft = ghostVisual('left', false, true);
            finalLeft = ghostVisual('left', false, false);
          }
          needsFrame = true;
        } else if (leavingSide === 'left') {
          instantLeft = ghostVisual('left', false, true);
          finalLeft = ghostVisual('left', false, false);
          instantRight = ghostVisual('right', false, false);
          finalRight = instantRight;
          needsFrame = true;
        } else {
          instantRight = ghostVisual('right', false, true);
          finalRight = ghostVisual('right', false, false);
          instantLeft = ghostVisual('left', false, false);
          finalLeft = instantLeft;
          needsFrame = true;
        }
      } else {
        finalLeft = ghostVisual('left', parked && target === 3, false);
        finalRight = ghostVisual('right', parked && target === -3, false);
        instantLeft = finalLeft;
        instantRight = finalRight;
      }

      finalVisuals.push({ main: finalMain, left: finalLeft, right: finalRight });
      instantVisuals.push({
        main: mainVisual(teleported ? start : target, teleported),
        left: instantLeft,
        right: instantRight,
      });
      if (teleported) needsFrame = true;
    });

    visualsRef.current = finalVisuals;
    setVisuals(needsFrame ? instantVisuals : finalVisuals);
    if (needsFrame) {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        setVisuals(finalVisuals);
      });
    }
  }, []);

  const clearStepTimer = useCallback(() => {
    if (stepTimerRef.current !== null) {
      window.clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  }, []);

  const goTo = useCallback((index: number) => {
    const count = itemsRef.current.length;
    if (!count) return;
    const target = ((index % count) + count) % count;
    let steps = (target - activeRef.current + count) % count;
    if (steps > count / 2) steps -= count;
    if (steps === 0 && target === selectedRef.current) return;
    clearStepTimer();
    selectedRef.current = target;
    setSelected(target);
    if (steps === 0) return;

    const direction = Math.sign(steps);
    let remaining = Math.abs(steps);
    const tick = () => {
      const nextActive = ((activeRef.current + direction) % count + count) % count;
      activeRef.current = nextActive;
      layout(nextActive, direction);
      remaining -= 1;
      if (remaining <= 0) clearStepTimer();
    };
    tick();
    if (remaining > 0) stepTimerRef.current = window.setInterval(tick, STEP_MS);
  }, [clearStepTimer, layout]);

  const transitionModal = useCallback((open: boolean) => {
    const updateModal = () => flushSync(() => setModalOpen(open));
    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => unknown;
    };
    if (transitionDocument.startViewTransition) transitionDocument.startViewTransition(updateModal);
    else updateModal();
  }, []);

  useEffect(() => {
    clearStepTimer();
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    activeRef.current = 0;
    selectedRef.current = 0;
    setSelected(0);
    layout(0, 0, true);
    return () => {
      clearStepTimer();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [clearStepTimer, itemSignature, layout]);

  useEffect(() => {
    const handleVisibility = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && modalOpen) {
        transitionModal(false);
        return;
      }
      if (modalOpen) return;
      if (event.key === 'ArrowLeft') goTo(selectedRef.current - 1);
      if (event.key === 'ArrowRight') goTo(selectedRef.current + 1);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [goTo, modalOpen, transitionModal]);

  useEffect(() => {
    if (!modalOpen) return;
    document.body.classList.add('try-look-modal-open');
    return () => document.body.classList.remove('try-look-modal-open');
  }, [modalOpen]);

  useEffect(() => () => {
    clearStepTimer();
  }, [clearStepTimer]);

  const handleStageClick = (event: MouseEvent<HTMLDivElement>) => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = (event.clientX - bounds.left) / bounds.width;
    if (position < .34) goTo(selectedRef.current - 1);
    else if (position > .66) goTo(selectedRef.current + 1);
  };

  const openModel = () => transitionModal(true);

  if (items.length === 0) return null;
  const lowerBound = -Math.floor(items.length / 2);
  const held = hovered || pageHidden || modalOpen;
  const current = items[selected] || items[0];
  const genres = current.genres?.join(' · ') || current.category || 'Series';

  return (
    <>
      <section
        className="try-look-experience"
        aria-label="Interactive featured series carousel"
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
      >
        <div
          className={`try-look-showcase${playing ? ' is-playing' : ''}${held ? ' is-held' : ''}`}
          style={{ '--try-look-tick': `${TICK_MS}ms` } as CSSProperties}
        >
        <header className="try-look-intro">
          <span className="try-look-intro-kicker">Series spotlight</span>
          <h1>Featured <span>Series</span></h1>
          <p>Browse featured titles. Tap one to explore.</p>
        </header>
        <div
          className="try-look-stage"
          aria-label="Look carousel"
          onPointerDown={(event) => {
            if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
            pointerStartRef.current = event.clientX;
            draggedRef.current = false;
            const modelTarget = event.target instanceof HTMLElement
              ? event.target.closest<HTMLElement>('.try-look-model[role="button"]')
              : null;
            (modelTarget || event.currentTarget).setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            if (pointerStartRef.current === null) return;
            const distance = event.clientX - pointerStartRef.current;
            if (Math.abs(distance) > 42) {
              draggedRef.current = true;
              goTo(selectedRef.current + (distance < 0 ? 1 : -1));
            }
            pointerStartRef.current = null;
          }}
          onPointerCancel={() => { pointerStartRef.current = null; }}
          onClick={handleStageClick}
        >
          {items.map((item, index) => {
            const model = visuals[index];
            if (!model) return null;
            const mainStyle = slotStyle(model.main.slot, model.main.instant);
            const leftStyle = slotStyle(model.left.slot, model.left.instant);
            const rightStyle = slotStyle(model.right.slot, model.right.instant);
            const image = item.spotlightImage || `/try-the-look/${LOOK_IMAGES[index]}`;
            return (
              <div className="try-look-model-set" key={item.id}>
                <figure className="try-look-model try-look-model-echo" data-slot={model.left.slot} style={leftStyle} aria-hidden="true">
                  <img src={image} alt="" draggable={false} />
                </figure>
                <figure className="try-look-model try-look-model-echo" data-slot={model.right.slot} style={rightStyle} aria-hidden="true">
                  <img src={image} alt="" draggable={false} />
                </figure>
                <figure
                  className={`try-look-model${model.main.slot === 0 ? ' is-active' : ''}${model.main.slot === 0 && !modalOpen ? ' is-shared-source' : ''}`}
                  data-slot={model.main.slot}
                  style={{ ...mainStyle, pointerEvents: 'auto' }}
                  role={model.main.slot === 0 ? 'button' : undefined}
                  tabIndex={model.main.slot === 0 ? 0 : -1}
                  aria-label={model.main.slot === 0 ? `Open ${item.title}` : undefined}
                  onClick={(event) => {
                    if (model.main.slot !== 0) {
                      event.stopPropagation();
                      return;
                    }
                    if (draggedRef.current) {
                      draggedRef.current = false;
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                    event.stopPropagation();
                    goTo(index);
                    openModel();
                  }}
                  onKeyDown={(event) => {
                    if (model.main.slot === 0 && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      goTo(index);
                      openModel();
                    }
                  }}
                >
                  <img src={image} alt="" draggable={false} />
                </figure>
              </div>
            );
          })}
        </div>
        <div className="try-look-controls">
          <button className="try-look-arrow prev" type="button" aria-label="Previous look" onClick={() => goTo(selectedRef.current - 1)}>
            <ArrowLeft />
          </button>
          <nav
            className="try-look-tabs"
            aria-label="Choose a look"
            onAnimationEnd={(event) => {
              if (
                playing && !held && event.target instanceof HTMLElement &&
                event.target.matches('.try-look-tab-bar i') &&
                event.target.closest('.try-look-tab')?.getAttribute('aria-current') === 'true'
              ) goTo(selectedRef.current + 1);
            }}
          >
            {items.map((item, index) => (
              <button
                className={`try-look-tab${index === selected ? ' is-current' : ''}${index === selected && playing ? ' is-playing' : ''}`}
                type="button"
                key={item.id}
                aria-current={index === selected ? 'true' : undefined}
                aria-label={`Look ${String(index + 1).padStart(2, '0')}: ${item.title}`}
                onClick={() => goTo(index)}
              >
                <span className="try-look-tab-bar"><i /></span>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <span className="try-look-name">{item.title}</span>
              </button>
            ))}
          </nav>
          <button
            className="try-look-play"
            type="button"
            aria-label={playing ? 'Pause autoplay' : 'Play autoplay'}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? <span className="try-look-pause-mark">Ⅱ</span> : <span className="try-look-play-mark">▶</span>}
          </button>
          <button className="try-look-arrow next" type="button" aria-label="Next look" onClick={() => goTo(selectedRef.current + 1)}>
            <ArrowRight />
          </button>
        </div>
        </div>
      </section>

      {modalOpen && createPortal(
        <div
          className="try-look-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="try-look-modal-title"
          onClick={(event) => {
            if (event.target instanceof Element && !event.target.closest('.try-look-modal-model, .try-look-modal-read-now, .try-look-modal-close')) {
              transitionModal(false);
            }
          }}
        >
          <section className="try-look-modal-stage">
            <div className="try-look-modal-heading">
              <span>FEATURED SERIES {String(selected + 1).padStart(2, '0')}</span>
              <h2 id="try-look-modal-title">{current.title}</h2>
              <p>{genres}{current.status ? ` · ${current.status}` : ''}</p>
            </div>
            <button className="try-look-modal-close" type="button" aria-label="Close featured series details" onClick={() => transitionModal(false)}>
              <X />
            </button>
            <div className="try-look-modal-model is-shared-target">
              <img src={current.spotlightImage || `/try-the-look/${LOOK_IMAGES[selected]}`} alt={`Featured series artwork for ${current.title}`} />
            </div>
            <a href={current.href} className="try-look-modal-read-now">
              <span>Read now</span>
              <span className="try-look-modal-read-now-icon"><ArrowRight /></span>
            </a>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
