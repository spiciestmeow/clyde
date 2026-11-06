import { Link } from 'wouter';
import { useImgSkeleton } from '../hooks/useImgSkeleton';

export type MostPopularCardItem = {
  title: string;
  src: string;
  href: string;
  genres: string[];
};

type MostPopularCardProps = {
  item: MostPopularCardItem;
  imageSrc: string;
  rank: number;
};

function getGenreTone(title: string) {
  const tones = ['blue', 'rose', 'orange'] as const;
  const hash = Array.from(title).reduce((value, character) => (value * 31 + character.charCodeAt(0)) | 0, 0);
  return tones[Math.abs(hash) % tones.length];
}

export function MostPopularCard({
  item,
  imageSrc,
  rank,
}: MostPopularCardProps) {
  const { imgRef, loaded, onLoad, onError, imgClassName } = useImgSkeleton(imageSrc);

  return (
    <Link className="rank-card" href={item.href} data-genre-tone={getGenreTone(item.title)}>
      <span className={`rank-cover${!loaded ? ' card-shimmer' : ''}`}>
        <img
          ref={imgRef}
          src={imageSrc}
          alt={item.title}
          loading="lazy"
          className={imgClassName}
          onLoad={onLoad}
          onError={onError}
        />
      </span>
      <b className="rank-number">{rank}</b>
      <div className="rank-info">
        <span className="rank-title">{item.title}</span>
        {item.genres.length > 0 && (
          <div className="rank-genres">
            {item.genres.map((genre) => (
              <span className="rank-genre" key={genre}>
                {genre}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
