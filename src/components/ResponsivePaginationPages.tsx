import type { PaginationItem } from '../lib/pagination';

type ResponsivePaginationPagesProps = {
  items: PaginationItem[];
  mobileItems: PaginationItem[];
  currentPage: number;
  onSelect: (page: number) => void;
  disabled?: boolean;
};

function PageList({
  items,
  currentPage,
  onSelect,
  disabled,
  className,
}: {
  items: PaginationItem[];
  currentPage: number;
  onSelect: (page: number) => void;
  disabled: boolean;
  className: string;
}) {
  return (
    <ul className={`release-pagination__pages ${className}`}>
      {items.map((item, index) => item === 'ellipsis'
        ? <li key={`ellipsis-${index}`}><span className="release-page-button release-page-button--ellipsis" aria-hidden="true">…</span></li>
        : <li key={item}><button
          type="button"
          className={`release-page-button release-page-button--number${item === currentPage ? ' is-current' : ''}`}
          aria-label={`Page ${item}`}
          aria-current={item === currentPage ? 'page' : undefined}
          onClick={() => onSelect(item)}
          disabled={disabled}
        >{item}</button></li>)}
    </ul>
  );
}

export default function ResponsivePaginationPages({
  items,
  mobileItems,
  currentPage,
  onSelect,
  disabled = false,
}: ResponsivePaginationPagesProps) {
  return <>
    <PageList items={items} currentPage={currentPage} onSelect={onSelect} disabled={disabled} className="release-pagination__pages--desktop" />
    <PageList items={mobileItems} currentPage={currentPage} onSelect={onSelect} disabled={disabled} className="release-pagination__pages--mobile" />
  </>;
}
