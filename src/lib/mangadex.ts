export type MangaDexImportData = {
  id: string;
  title: string;
  alternateTitles: string[];
  description: string;
  authors: string[];
  artists: string[];
  publishers: string[];
  type: string;
  contentRating: string;
  status: string;
  year: string;
  originalLanguage: string;
  demographics: string[];
  genres: string[];
  formats: string[];
  tags: string[];
  coverUrl?: string;
  trackerUrl: string;
};

const GENRES_LIST = [
  'Action', 'Adult', 'Adventure', 'Boys Love', 'Comedy', 'Crime', 'Drama', 'Ecchi',
  'Fantasy', 'Girls Love', 'Harem', 'Hentai', 'Historical', 'Horror', 'Isekai',
  'Magical Girls', 'Mecha', 'Medical', 'Mystery', 'Philosophical', 'Psychological',
  'Romance', 'Sci-Fi', 'Slice of Life', 'Smut', 'Sports', 'Superhero', 'Thriller',
  'Tragedy', 'Wuxia'
];

const FORMATS_LIST = [
  '4-Koma', 'Adaptation', 'Anthology', 'Award Winning', 'Doujinshi', 'Full Color',
  'Long Strip', 'Oneshot', 'Web Comic'
];

export function extractMangaDexId(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Please enter a MangaDex link or ID.');
  }

  // Handle formats like:
  // https://mangadex.org/title/50d15bb8-98b7-471b-abb8-093759a4ed48/ore-wa-bankyou-g
  // https://mangadex.org/title/50d15bb8-98b7-471b-abb8-093759a4ed48
  // 50d15bb8-98b7-471b-abb8-093759a4ed48
  const urlMatch = trimmed.match(/mangadex\.org\/(?:title|manga)\/([^/?#]+)/i);
  const potentialId = urlMatch ? urlMatch[1] : trimmed;

  // Standard MangaDex UUID: 8-4-4-4-12 hex characters
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(potentialId)) {
    throw new Error(`Unable to read api: ${potentialId}`);
  }

  return potentialId.toLowerCase();
}

export async function fetchMangaDexDetails(rawInput: string): Promise<MangaDexImportData> {
  const id = extractMangaDexId(rawInput);

  let response: Response | null = null;
  const endpoint = `/manga/${id}?includes[]=author&includes[]=artist&includes[]=cover_art`;
  
  // Try internal proxy route (/api/mangadex) first (supported via Vercel rewrites and Vite proxy)
  try {
    response = await fetch(`/api/mangadex${endpoint}`);
  } catch {
    // ignore and try fallback
  }

  // Fallback to corsproxy if running in direct environment without server rewrite
  if (!response || !response.ok) {
    try {
      response = await fetch(`https://api.mangadex.org${endpoint}`);
    } catch {
      try {
        response = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(`https://api.mangadex.org${endpoint}`)}`);
      } catch {
        throw new Error(`Unable to read api: ${id}`);
      }
    }
  }

  if (!response || !response.ok) {
    throw new Error(`Unable to read api: ${id}`);
  }

  let json: any;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Unable to read api: ${id}`);
  }

  const manga = json?.data;
  const attributes = manga?.attributes;
  if (!attributes) {
    throw new Error(`Unable to read api: ${id}`);
  }

  // Title extraction
  const titleObj = attributes.title || {};
  const title = (
    titleObj.en ||
    titleObj['ja-ro'] ||
    titleObj['ko-ro'] ||
    titleObj['zh-ro'] ||
    Object.values(titleObj)[0] ||
    ''
  ).trim();

  // Alternative titles
  const alternateTitles: string[] = [];
  if (Array.isArray(attributes.altTitles)) {
    for (const altObj of attributes.altTitles) {
      if (altObj && typeof altObj === 'object') {
        for (const val of Object.values(altObj)) {
          if (typeof val === 'string' && val.trim() && !alternateTitles.includes(val.trim())) {
            alternateTitles.push(val.trim());
          }
        }
      }
    }
  }

  // Description
  const descObj = attributes.description || {};
  const description = (descObj.en || Object.values(descObj)[0] || '').trim();

  // Relationships (Author, Artist, Cover)
  const authors: string[] = [];
  const artists: string[] = [];
  let coverFileName = '';
  let coverRelId = '';

  if (Array.isArray(manga.relationships)) {
    for (const rel of manga.relationships) {
      if (rel.type === 'author' && rel.attributes?.name) {
        authors.push(rel.attributes.name.trim());
      } else if (rel.type === 'artist' && rel.attributes?.name) {
        artists.push(rel.attributes.name.trim());
      } else if (rel.type === 'cover_art') {
        if (rel.attributes?.fileName) {
          coverFileName = rel.attributes.fileName;
        } else if (rel.id) {
          coverRelId = rel.id;
        }
      }
    }
  }

  // If cover_art attributes weren't included in the response, fetch cover file name directly
  if (!coverFileName && coverRelId) {
    try {
      let coverRes = await fetch(`/api/mangadex/cover/${coverRelId}`).catch(() => null);
      if (!coverRes || !coverRes.ok) {
        coverRes = await fetch(`https://api.mangadex.org/cover/${coverRelId}`).catch(() => null);
      }
      if (!coverRes || !coverRes.ok) {
        coverRes = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(`https://api.mangadex.org/cover/${coverRelId}`)}`).catch(() => null);
      }
      if (coverRes && coverRes.ok) {
        const coverJson = await coverRes.json();
        coverFileName = coverJson?.data?.attributes?.fileName || '';
      }
    } catch {
      // ignore
    }
  }

  // Classification & Language
  const langCode = (attributes.originalLanguage || '').toLowerCase();
  let originalLanguage = 'Japanese';
  let type = 'Manga';

  if (langCode === 'ko') {
    originalLanguage = 'Korean';
    type = 'Manhwa';
  } else if (langCode === 'zh' || langCode === 'zh-hk') {
    originalLanguage = 'Chinese';
    type = 'Manhua';
  } else if (langCode === 'en') {
    originalLanguage = 'English';
    type = 'Comic';
  } else if (langCode) {
    originalLanguage = 'Other';
  }

  // Status mapping
  const rawStatus = (attributes.status || '').toLowerCase();
  let status = 'Releasing';
  if (rawStatus === 'completed') status = 'Completed';
  else if (rawStatus === 'hiatus') status = 'Hiatus';
  else if (rawStatus === 'cancelled') status = 'Cancelled';

  // Content rating
  const rawRating = (attributes.contentRating || '').toLowerCase();
  let contentRating = 'Safe';
  if (rawRating === 'suggestive') contentRating = 'Suggestive';
  else if (rawRating === 'erotica') contentRating = 'Erotica';
  else if (rawRating === 'pornographic') contentRating = 'Pornographic';

  // Year
  const year = attributes.year ? String(attributes.year) : '';

  // Demographic
  const demographics: string[] = [];
  const rawDemo = (attributes.publicationDemographic || '').toLowerCase();
  if (rawDemo === 'shounen') demographics.push('Shounen');
  else if (rawDemo === 'shoujo') demographics.push('Shoujo');
  else if (rawDemo === 'seinen') demographics.push('Seinen');
  else if (rawDemo === 'josei') demographics.push('Josei');

  // Genres, Formats, and Tags
  const genres: string[] = [];
  const formats: string[] = [];
  const tags: string[] = [];

  if (Array.isArray(attributes.tags)) {
    for (const tag of attributes.tags) {
      const tagName = tag.attributes?.name?.en;
      if (!tagName) continue;

      const genreMatch = GENRES_LIST.find((g) => g.toLowerCase() === tagName.toLowerCase());
      if (genreMatch) {
        if (!genres.includes(genreMatch)) genres.push(genreMatch);
        continue;
      }

      const formatMatch = FORMATS_LIST.find((f) => f.toLowerCase() === tagName.toLowerCase());
      if (formatMatch) {
        if (!formats.includes(formatMatch)) formats.push(formatMatch);
        if (formatMatch === 'Long Strip' && type === 'Manga' && (langCode === 'ko' || langCode === 'zh')) {
          type = langCode === 'ko' ? 'Manhwa' : 'Manhua';
        }
        continue;
      }

      if (!tags.includes(tagName)) {
        tags.push(tagName);
      }
    }
  }

  // Optional MangaDex cover URL (fallback if user wants to use it)
  const coverUrl = coverFileName ? `https://uploads.mangadex.org/covers/${id}/${coverFileName}` : undefined;

  return {
    id,
    title,
    alternateTitles,
    description,
    authors,
    artists,
    publishers: [],
    type,
    contentRating,
    status,
    year,
    originalLanguage,
    demographics,
    genres,
    formats,
    tags,
    coverUrl,
    trackerUrl: `https://mangadex.org/title/${id}`,
  };
}
