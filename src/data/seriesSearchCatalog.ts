import type { SeriesRecord } from "../lib/seriesCatalog";
import type { SiteSearchItem } from "../components/SiteSearch";

export function toSiteSearchItems(series: SeriesRecord[]): SiteSearchItem[] {
  return [...series]
    .sort((left, right) =>
      left.pageNumber - right.pageNumber ||
      left.pageOrder - right.pageOrder ||
      left.title.localeCompare(right.title),
    )
    .map((item) => ({
      title: item.title,
      href: item.href,
      cover: item.cover,
      category: item.category,
      searchText: [
        item.title,
        ...item.alternateTitles,
        item.category,
        item.status,
        ...item.genres,
        ...item.tags,
        ...item.publishers,
      ].join(" "),
    }));
}

export function toTrendingSiteSearchItems(series: SeriesRecord[]): SiteSearchItem[] {
  return [...series]
    .sort((left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      Number(right.rating ?? 0) - Number(left.rating ?? 0) ||
      left.title.localeCompare(right.title),
    )
    .slice(0, 4)
    .map((item) => ({
      title: item.title,
      href: item.href,
      cover: item.cover,
      category: item.category,
      searchText: [item.title, ...item.alternateTitles, ...item.genres].join(" "),
    }));
}
