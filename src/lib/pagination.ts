export type PaginationItem = number | 'ellipsis';

export function getPaginationItems(pageCount: number, currentPage: number): PaginationItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  let startPage = Math.max(2, currentPage - 2);
  let endPage = Math.min(pageCount - 1, currentPage + 2);

  if (currentPage <= 4) {
    startPage = 2;
    endPage = 5;
  } else if (currentPage >= pageCount - 3) {
    startPage = pageCount - 4;
    endPage = pageCount - 1;
  }

  const items: PaginationItem[] = [1];
  if (startPage > 2) items.push('ellipsis');
  for (let page = startPage; page <= endPage; page += 1) items.push(page);
  if (endPage < pageCount - 1) items.push('ellipsis');
  items.push(pageCount);
  return items;
}
