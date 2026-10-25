import { useEffect, useRef, useState, type ImgHTMLAttributes, type TouchEvent } from 'react';
import type { HeroSlide } from '../lib/siteSettings';

interface HeroSlideImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  srcSet?: string;
  visible: boolean;
}

function HeroSlideImage({ src, srcSet, visible, ...imageProps }: HeroSlideImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const sourceKey = `${src}\u0000${srcSet || ''}`;
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const isLoaded = loadedSource === sourceKey;

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      setLoadedSource(sourceKey);
    }
  }, [sourceKey]);

  return (
    <>
      {visible && !isLoaded && (
        <span className="hero-image-shimmer" aria-hidden="true" />
      )}
      <img
        {...imageProps}
        ref={imageRef}
        src={src}
        srcSet={srcSet}
        onLoad={() => setLoadedSource(sourceKey)}
        onError={() => setLoadedSource(sourceKey)}
      />
    </>
  );
}

interface HeroSliderProps {
  slides: HeroSlide[];
}

export default function HeroSlider({ slides }: HeroSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchDeltaXRef = useRef<number>(0);

  const total = slides.length;

  // Auto-play every 5 seconds (pauses on hover)
  useEffect(() => {
    if (total <= 1 || isHovered) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % total);
    }, 5000);
    return () => clearInterval(interval);
  }, [total, isHovered]);

  if (total === 0) return null;

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % total);
  };

  const goToPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  };

  const handleTouchStart = (e: TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchDeltaXRef.current = 0;
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (touchStartXRef.current !== null) {
      touchDeltaXRef.current = e.touches[0].clientX - touchStartXRef.current;
    }
  };

  const handleTouchEnd = () => {
    if (Math.abs(touchDeltaXRef.current) > 40) {
      if (touchDeltaXRef.current < 0) {
        goToNext();
      } else {
        goToPrev();
      }
    }
    touchStartXRef.current = null;
    touchDeltaXRef.current = 0;
  };

  const prevIndex = (currentIndex - 1 + total) % total;
  const nextIndex = (currentIndex + 1) % total;

  return (
    <div className="hero-full-bleed">
      <section
        className="main-banner-slider"
        aria-label="Featured series"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="hero-slider-track">
          {slides.map((slide, index) => {
            let positionClass = 'is-hidden';
            if (index === currentIndex) {
              positionClass = 'is-active';
            } else if (total > 1 && index === prevIndex) {
              positionClass = 'is-prev';
            } else if (total > 1 && index === nextIndex) {
              positionClass = 'is-next';
            }

            return (
              <div
                key={slide.id || index}
                className={`hero-slide-item ${positionClass}`}
                onClick={() => {
                  if (positionClass === 'is-prev') goToPrev();
                  if (positionClass === 'is-next') goToNext();
                }}
              >
                <a
                  href={slide.href || '/'}
                  aria-label={`Open ${slide.title || 'Featured Series'}`}
                  onClick={(e) => {
                    // Only navigate if clicking the active slide
                    if (positionClass !== 'is-active') {
                      e.preventDefault();
                    }
                  }}
                >
                  <HeroSlideImage
                    src={slide.src}
                    srcSet={slide.srcset || undefined}
                    alt={slide.title || ''}
                    loading={index === currentIndex ? 'eager' : 'lazy'}
                    decoding="async"
                    visible={positionClass !== 'is-hidden'}
                  />
                </a>
              </div>
            );
          })}
        </div>

        {total > 1 && (
          <>
            <button
              type="button"
              className="hero-nav-btn prev"
              aria-label="Previous slide"
              onClick={goToPrev}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              className="hero-nav-btn next"
              aria-label="Next slide"
              onClick={goToNext}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </>
        )}
      </section>
    </div>
  );
}
