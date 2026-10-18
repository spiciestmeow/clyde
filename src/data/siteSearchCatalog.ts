import type { SiteSearchItem } from '../components/SiteSearch';
import catalogData from '../../clone-data/series-catalog.json';
import seriesDetailsData from '../../clone-data/series-details.json';
import releaseData from '../../clone-data/latest-releases.json';

type CatalogSearchRecord = Pick<
  SiteSearchItem,
  'title' | 'href' | 'cover' | 'category'
> & { pageNumber: number; pageOrder: number };
type SeriesSearchDetails = { genres?: string[] };

const catalog = catalogData as { items: CatalogSearchRecord[] };
const seriesDetails = seriesDetailsData as Record<string, SeriesSearchDetails>;
const referenceLeadOrder = [
  '/series/fantasy-induction-corps',
  "/series/the-academy's-weapon-copycat",
  '/series/archmage-curriculum',
  '/series/dao-of-the-bizarre-immortal',
  "/series/superhuman's-gaming-stream",
  '/series/regressed-blood-demon',
  '/series/a-grimoire-changed-my-fate',
  '/series/i-offered-kimchi-ramen-to-the-gods',
  '/series/reality-quest-2',
];
const referenceLeadRanks = new Map(referenceLeadOrder.map((href, index) => [href, index]));

export const siteSearchItems: SiteSearchItem[] = [...catalog.items]
  .sort((a, b) =>
    (referenceLeadRanks.get(a.href) ?? Number.MAX_SAFE_INTEGER) -
      (referenceLeadRanks.get(b.href) ?? Number.MAX_SAFE_INTEGER) ||
    a.pageNumber - b.pageNumber ||
    a.pageOrder - b.pageOrder,
  )
  .map((item) => {
    const slug = item.href.split('/').pop() ?? '';
    return {
      title: item.title,
      href: item.href,
      cover: item.cover,
      category: item.category,
      searchText: [
        item.title,
        item.category ?? '',
        ...(seriesDetails[slug]?.genres ?? []),
      ].join(' '),
    };
  });

export const trendingSiteSearchItems = (
  releaseData as SiteSearchItem[]
).slice(0, 4);
