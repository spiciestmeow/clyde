export function formatScanlatorSeriesUrl(scanlatorName: string, rawUrl: string, seriesTitle: string): string {
  if (!rawUrl) return '';
  const encoded = encodeURIComponent(seriesTitle.trim());
  const lowerName = scanlatorName.toLowerCase();

  try {
    const parsed = new URL(rawUrl);
    const cleanPath = parsed.pathname.replace(/\/$/, '');
    if (parsed.search || (cleanPath.length > 1 && !['/series', '/manga', '/comics', '/comic'].includes(cleanPath))) return rawUrl;
    if (lowerName.includes('asura') || parsed.hostname.includes('asura')) return `https://asuracomic.net/series?name=${encoded}`;
    if (lowerName.includes('reaper') || parsed.hostname.includes('reaper')) return `https://reaperscans.com/series?query=${encoded}`;
    if (lowerName.includes('flame') || parsed.hostname.includes('flame')) return `https://flamecomics.xyz/series?search=${encoded}`;
    if (lowerName.includes('mangadex') || parsed.hostname.includes('mangadex')) return `https://mangadex.org/search?q=${encoded}`;
    if (lowerName.includes('zero') || parsed.hostname.includes('zero')) return `https://zeroscans.com/?s=${encoded}&post_type=wp-manga`;
    if (lowerName.includes('hive') || lowerName.includes('void') || parsed.hostname.includes('hive')) return `https://hivescans.com/?s=${encoded}&post_type=wp-manga`;
    if (lowerName.includes('diva') || parsed.hostname.includes('diva')) return `https://divascans.com/?s=${encoded}&post_type=wp-manga`;
    if (lowerName.includes('genz') || parsed.hostname.includes('genz')) return `https://genztoons.com/?s=${encoded}&post_type=wp-manga`;
    if (lowerName.includes('o translation') || parsed.hostname.includes('otranslations')) return `https://otranslations.com/?s=${encoded}`;
    if (lowerName.includes('drake') || parsed.hostname.includes('drake')) return `https://drakescans.com/?s=${encoded}&post_type=wp-manga`;
    if (lowerName.includes('cosmic') || parsed.hostname.includes('cosmic')) return `https://cosmicscans.com/?s=${encoded}&post_type=wp-manga`;
    if (lowerName.includes('realm') || lowerName.includes('rizz') || parsed.hostname.includes('rizz')) return `https://rizzfables.com/?s=${encoded}&post_type=wp-manga`;
    if (lowerName.includes('luminous') || parsed.hostname.includes('luminous')) return `https://luminousscans.net/?s=${encoded}&post_type=wp-manga`;
    if (lowerName.includes('immortal') || parsed.hostname.includes('immortal')) return `https://immortalupdates.com/?s=${encoded}&post_type=wp-manga`;
    return `${parsed.origin}/?s=${encoded}&post_type=wp-manga`;
  } catch {
    return rawUrl;
  }
}
