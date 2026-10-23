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
  return (
    <Link
      className="popular-card"
      href={item.href}
      data-loop-copy={copyIndex}
      title={item.title}
      draggable={false}
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

