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

export function MostPopularCard({
  item,
  imageSrc,
  rank,
}: MostPopularCardProps) {
  return (
    <a className="rank-card" href={item.href}>
      <span className="rank-cover">
        <img src={imageSrc} alt={item.title} loading="lazy" />
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
    </a>
  );
}
