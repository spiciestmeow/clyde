import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Returns a ref to attach to an <img> element, a boolean `loaded`,
 * and an `imgClassName` that smoothly fades the image in once loaded.
 * Use to toggle a `.card-shimmer` class on the cover wrapper.
 */
export function useImgSkeleton(src?: string | null) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!src) {
      setLoaded(true);
      return;
    }
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true);
    } else {
      setLoaded(false);
    }
  }, [src]);

  const onLoad = useCallback(() => setLoaded(true), []);
  const onError = useCallback(() => setLoaded(true), []);

  const isLoaded = loaded || !src;

  return {
    imgRef,
    loaded: isLoaded,
    onLoad,
    onError,
    imgClassName: `cover-img-shimmer${isLoaded ? ' is-loaded' : ''}`,
  };
}
