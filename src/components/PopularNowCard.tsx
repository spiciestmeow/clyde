import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'wouter';

export type PopularNowCardItem = {
  title: string;
  src: string;
  href: string;
};

type PopularNowCardProps = {
  item: PopularNowCardItem;
  imageSrc: string;
  copyIndex?: number;
};

export function PopularNowCard({
  item,
  imageSrc,
  copyIndex = 0,
}: PopularNowCardProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const [isLongPressed, setIsLongPressed] = useState(false);

  const clearLongPressTimer = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  useEffect(() => clearLongPressTimer, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === 'mouse' || event.button !== 0) return;
    clearLongPressTimer();
    pointerStart.current = { x: event.clientX, y: event.clientY };
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setIsLongPressed(true);
    }, 450);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const start = pointerStart.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
      clearLongPressTimer();
      setIsLongPressed(false);
    }
  };

  const handlePointerEnd = () => {
    clearLongPressTimer();
    pointerStart.current = null;
    setIsLongPressed(false);
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!longPressTriggered.current) return;
    event.preventDefault();
    event.stopPropagation();
    longPressTriggered.current = false;
  };

  return (
    <Link
      className={`popular-card${isLongPressed ? ' is-long-pressed' : ''}`}
      href={item.href}
      data-loop-copy={copyIndex}
      title={item.title}
      draggable={false}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClickCapture={handleClickCapture}
    >
      <div className="popular-card__card">
        <div className="popular-card__art">
          <img
            draggable={false}
            src={imageSrc}
            alt={`Cover of ${item.title}`}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="popular-card__title">
          <h3>{item.title}</h3>
        </div>
      </div>
    </Link>
  );
}

