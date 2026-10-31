export interface DetectedChapterItem {
  number: number;
  title: string;
  url?: string;
  /** ISO timestamp of when this chapter was uploaded on the source site */
  releasedAt?: string;
  /** Which source this chapter's time came from */
  sourceName?: string;
}

function parseMonthDayWithoutYear(text: string): number | null {
  const match = text.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b(?!\s*,?\s+\d{4})/i,
  );
  if (!match) return null;

  const monthKey = match[1].slice(0, 3).toLowerCase();
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monthKey);
  const day = Number(match[2]);
  if (month < 0 || day < 1 || day > 31) return null;

  const now = new Date();
  let date = new Date(now.getFullYear(), month, day);
  if (date.getMonth() !== month || date.getDate() !== day) return null;

  // Yearless calendar labels refer to the latest occurrence of that date.
  // This handles a date near New Year without interpreting it as a future post.
  if (date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    date = new Date(now.getFullYear() - 1, month, day);
  }
  return date.getTime();
}

/**
 * Parse relative time strings like "3 hours ago", "about 9 hours", "7h ago",
 * "10 mins ago", "yesterday", "2 days ago" into an absolute timestamp (ms).
 */
function parseRelativeTime(text: string): number | null {
  if (!text) return null;
  const s = text.trim().toLowerCase();

  const relRegex =
    /(?:about\s+)?(\d+(?:\.\d+)?)\s*(seconds?|secs?|s\s*ago|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?|[mhdwymo]\b)(?:\s*ago)?/i;
  const m = s.match(relRegex);
  if (m) {
    const val = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    let ms = 0;
    if (unit.startsWith('s')) ms = val * 1000;
    else if (unit.startsWith('mi') || unit === 'm') ms = val * 60 * 1000;
    else if (unit.startsWith('h')) ms = val * 60 * 60 * 1000;
    else if (unit.startsWith('d')) ms = val * 24 * 60 * 60 * 1000;
    else if (unit.startsWith('w')) ms = val * 7 * 24 * 60 * 60 * 1000;
    else if (unit.startsWith('mo')) ms = val * 30 * 24 * 60 * 60 * 1000;
    else if (unit.startsWith('y')) ms = val * 365 * 24 * 60 * 60 * 1000;
    return Date.now() - ms;
  }

  if (s === 'yesterday') return Date.now() - 24 * 60 * 60 * 1000;
  // "New" is often a chapter-status badge, not a posting time. Treating it as
  // now makes background sync overwrite the real release age with cron time.
  if (s === 'today' || s === 'just now') return Date.now();

  // Some chapter lists show calendar labels such as "May 29" without a year.
  // Resolve these explicitly instead of relying on browser-specific Date.parse.
  const yearlessDate = parseMonthDayWithoutYear(text);
  if (yearlessDate !== null) return yearlessDate;

  // Try standard ISO / date parsing
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed) && parsed > 946684800000 && parsed <= Date.now() + 86400000) {
    return parsed;
  }

  return null;
}

/**
 * Given raw HTML surrounding a chapter link/row, try to find a time indicator
 * in the nearby text (e.g. "3 hours ago", "7h ago", or a `<time>` tag).
 */
function extractTimeFromContext(
  surroundingHtml: string,
  timestampPreference: 'rightmost' | 'newest' | 'oldest' | 'calendar' | 'relative' = 'newest',
): number | null {
  // Prefer the date shown to readers in this chapter row. Some pages retain
  // stale `datetime` attributes after updating the visible relative age.
  const textOnly = surroundingHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const visibleTimeCandidates: { index: number; timestamp: number }[] = [];
  const visibleCalendarDateCandidates: { index: number; timestamp: number }[] = [];
  const relativeTimePattern =
    /(?:about\s+)?\d+(?:\.\d+)?\s*(?:seconds?|secs?|s\s*ago|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?|[mhdwymo]\b)(?:\s*ago)?|\b(?:yesterday|just now|today)\b/gi;
  for (const match of textOnly.matchAll(relativeTimePattern)) {
    const ts = parseRelativeTime(match[0]);
    if (ts) visibleTimeCandidates.push({ index: match.index, timestamp: ts });
  }

  // Extract a calendar date token so chapter numbers and other text in the
  // row cannot cause Date.parse to select an unrelated date.
  const absoluteDatePatterns = [
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*[AP]M)?)?/i,
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b(?!\s*,?\s+\d{4})/i,
    /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/i,
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/,
  ];
  for (const pattern of absoluteDatePatterns) {
    for (const match of textOnly.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
      const ts = parseRelativeTime(match[0]);
      if (ts) visibleCalendarDateCandidates.push({ index: match.index, timestamp: ts });
    }
  }

  // GenzToons shows a fresh relative age (for example, "7 hours ago") on
  // newly posted chapter cards, while the same context may include older
  // calendar dates. Use that relative age for GenzToons when available.
  if (timestampPreference === 'relative' && visibleTimeCandidates.length > 0) {
    const chapterLabel = textOnly.match(/\b(?:chapter|episode)\s*#?\s*\d+(?:\.\d+)?/i);
    if (!chapterLabel) return Math.max(...visibleTimeCandidates.map((candidate) => candidate.timestamp));

    const labelStart = chapterLabel.index ?? 0;
    const labelEnd = labelStart + chapterLabel[0].length;
    return visibleTimeCandidates.reduce((nearest, candidate) => {
      const distance = candidate.index > labelEnd
        ? candidate.index - labelEnd
        : candidate.index < labelStart
          ? labelStart - candidate.index
          : 0;
      const nearestDistance = nearest.index > labelEnd
        ? nearest.index - labelEnd
        : nearest.index < labelStart
          ? labelStart - nearest.index
          : 0;
      return distance < nearestDistance ? candidate : nearest;
    }).timestamp;
  }

  // Some GenzToons pages expose the exact post time in machine-readable
  // attributes, while their visible text is a calendar date. Check those
  // source-row attributes before the generic calendar-date fallback below.
  if (timestampPreference === 'relative') {
    // The redesigned GenzToons chapter cards can keep the relative age in a
    // tooltip/accessibility attribute while showing a calendar date visibly.
    // Prefer that reader-facing relative age over the older calendar label.
    const descriptiveTimeMatches = surroundingHtml.matchAll(/\b(?:title|aria-label|data-original-title|data-bs-title)=["']([^"']+)["']/gi);
    for (const match of descriptiveTimeMatches) {
      const timestamp = parseRelativeTime(match[1]);
      if (timestamp) return timestamp;
    }

    const dataTimeMatches = surroundingHtml.matchAll(/\b(data-[\w-]*(?:time|date|ago|publish|created|tooltip)[\w-]*)=["']([^"']+)["']/gi);
    for (const match of dataTimeMatches) {
      const value = match[2].trim();
      const timestamp = parseRelativeTime(value);
      if (timestamp) return timestamp;

      const numericTimestamp = Number(value);
      if (Number.isFinite(numericTimestamp)) {
        const timestampMs = numericTimestamp < 1e12 ? numericTimestamp * 1000 : numericTimestamp;
        if (timestampMs > 946684800000 && timestampMs <= Date.now() + 86400000) return timestampMs;
      }
    }

    for (const match of surroundingHtml.matchAll(/\bdatetime=["']([^"']+)["']/gi)) {
      const timestamp = parseRelativeTime(match[1]);
      if (timestamp) return timestamp;
    }
  }

  // Qi Manga exposes month/day labels like "May 29" alongside relative-time
  // metadata that can reflect when its page data was refreshed. This branch is
  // selected only for Qi Manga; all other sources retain the normal selection
  // logic below.
  if (timestampPreference === 'calendar' && visibleCalendarDateCandidates.length > 0) {
    const chapterLabel = textOnly.match(/\b(?:chapter|episode)\s*#?\s*\d+(?:\.\d+)?/i);
    if (!chapterLabel) {
      return Math.max(...visibleCalendarDateCandidates.map((candidate) => candidate.timestamp));
    }

    const labelStart = chapterLabel.index ?? 0;
    const labelEnd = labelStart + chapterLabel[0].length;
    return visibleCalendarDateCandidates.reduce((nearest, candidate) => {
      const distance = candidate.index > labelEnd
        ? candidate.index - labelEnd
        : candidate.index < labelStart
          ? labelStart - candidate.index
          : 0;
      const nearestDistance = nearest.index > labelEnd
        ? nearest.index - labelEnd
        : nearest.index < labelStart
          ? labelStart - nearest.index
          : 0;
      return distance < nearestDistance ? candidate : nearest;
    }).timestamp;
  }

  // Some sources (such as Asura) render the upload age at the right side of
  // each chapter row. Other sources use different layouts, so keep their
  // existing newest-timestamp selection behavior.
  if (timestampPreference === 'oldest' && (visibleTimeCandidates.length > 0 || visibleCalendarDateCandidates.length > 0)) {
    const candidates = [...visibleTimeCandidates, ...visibleCalendarDateCandidates];
    return candidates.reduce((oldest, candidate) =>
      candidate.timestamp < oldest.timestamp ? candidate : oldest,
    ).timestamp;
  }

  if (timestampPreference === 'rightmost' && (visibleTimeCandidates.length > 0 || visibleCalendarDateCandidates.length > 0)) {
    const candidates = [...visibleTimeCandidates, ...visibleCalendarDateCandidates];
    return candidates.reduce((rightmost, candidate) =>
      candidate.index > rightmost.index ? candidate : rightmost,
    ).timestamp;
  }

  // Chapter rows can include multiple timestamps, including unrelated page or
  // activity times. Associate the timestamp nearest the chapter label instead
  // of blindly choosing the newest (which can turn a months-old chapter into
  // "17 mins ago").
  const visibleCandidates = [...visibleTimeCandidates, ...visibleCalendarDateCandidates];
  if (visibleCandidates.length > 0) {
    const chapterLabel = textOnly.match(/\b(?:chapter|episode)\s*#?\s*\d+(?:\.\d+)?/i);
    if (chapterLabel) {
      const labelStart = chapterLabel.index ?? 0;
      const labelEnd = labelStart + chapterLabel[0].length;
      const nearestCandidate = visibleCandidates.reduce((nearest, candidate) => {
        const distance = candidate.index > labelEnd
          ? candidate.index - labelEnd
          : candidate.index < labelStart
            ? labelStart - candidate.index
            : 0;
        const nearestDistance = nearest.index > labelEnd
          ? nearest.index - labelEnd
          : nearest.index < labelStart
            ? labelStart - nearest.index
            : 0;
        return distance < nearestDistance ? candidate : nearest;
      });
      return nearestCandidate.timestamp;
    }

    return Math.max(...visibleCandidates.map((candidate) => candidate.timestamp));
  }

  // Prefer explicit machine-readable dates. Other attributes such as
  // aria-label="Chapter 24" may appear before the actual <time> element.
  const datetimeMatches = surroundingHtml.matchAll(/\bdatetime=["']([^"']+)["']/gi);
  for (const datetimeMatch of datetimeMatches) {
    const ts = parseRelativeTime(datetimeMatch[1]);
    if (ts) return ts;
  }

  // Only inspect title/aria-label values when they themselves contain a time.
  const labelMatches = surroundingHtml.matchAll(/\b(?:title|aria-label)=["']([^"']+)["']/gi);
  for (const labelMatch of labelMatches) {
    const ts = parseRelativeTime(labelMatch[1]);
    if (ts) return ts;
  }

  // Some chapter rows keep upload dates or relative-time labels in data
  // attributes instead of visible text (for example data-time or
  // data-published-at). Inspect only time/date-related data attributes.
  const dataTimeMatches = surroundingHtml.matchAll(/\b(data-[\w-]*(?:time|date|ago|publish|created|tooltip)[\w-]*)=["']([^"']+)["']/gi);
  for (const dataTimeMatch of dataTimeMatches) {
    const value = dataTimeMatch[2].trim();
    const relativeTs = parseRelativeTime(value);
    if (relativeTs) return relativeTs;

    const numericTimestamp = Number(value);
    if (Number.isFinite(numericTimestamp)) {
      const timestampMs = numericTimestamp < 1e12 ? numericTimestamp * 1000 : numericTimestamp;
      if (timestampMs > 946684800000 && timestampMs <= Date.now() + 86400000) return timestampMs;
    }
  }

  return null;
}

/**
 * Find a nearby chapter/list row so a timestamp from the next chapter is not
 * accidentally attributed to this chapter. Many scanlator pages put the time
 * in a sibling element rather than inside the chapter link itself.
 */
function extractChapterRowContext(
  html: string,
  matchStart: number,
  matchEnd: number,
  chapterNumber?: number,
  timestampPreference: 'rightmost' | 'newest' | 'oldest' | 'calendar' | 'relative' = 'newest',
): string | null {
  const searchStart = Math.max(0, matchStart - 2500);
  const prefix = html.slice(searchStart, matchStart);
  // Some sites (including Kayn Scans) use generic nested divs for chapter
  // rows, with the release time in a sibling inside the same row. Walk those
  // ancestors too, while only accepting a small context that identifies this
  // chapter uniquely so we don't borrow the next row's timestamp.
  const rowOpenRegex = /<(li|tr|article|div)\b[^>]*>/gi;
  const candidates: { index: number; tag: string }[] = [];
  let openMatch: RegExpExecArray | null;
  while ((openMatch = rowOpenRegex.exec(prefix)) !== null) {
    const tag = openMatch[1].toLowerCase();
    candidates.push({ index: searchStart + openMatch.index, tag });
  }

  for (let candidateIndex = candidates.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
    const candidate = candidates[candidateIndex];
    const openingEnd = html.indexOf('>', candidate.index);
    if (openingEnd < 0 || openingEnd >= matchStart) continue;
    const scanEnd = Math.min(html.length, matchEnd + 6000);
    const tagRegex = new RegExp(`<\\/?${candidate.tag}\\b[^>]*>`, 'gi');
    tagRegex.lastIndex = candidate.index;
    let depth = 0;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(html)) !== null && tagMatch.index < scanEnd) {
      if (/^<\//.test(tagMatch[0])) {
        depth -= 1;
        if (depth === 0) {
          if (tagMatch.index < matchEnd) break;
          const context = html.slice(candidate.index, tagRegex.lastIndex);
          const visibleText = context.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
          const chapterMatches = Array.from(visibleText.matchAll(/\b(?:chapter|episode)\s*(\d+(?:\.\d+)?)/gi))
            .map((chapterMatch) => parseFloat(chapterMatch[1]));
          const uniqueChapters = new Set(chapterMatches);
          if (
            extractTimeFromContext(context, timestampPreference) &&
            (chapterNumber === undefined || (uniqueChapters.size === 1 && uniqueChapters.has(chapterNumber)))
          ) {
            return context;
          }
          break;
        }
      } else {
        depth += 1;
      }
    }
  }

  return null;
}

function normalizeSeriesPathSegment(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep the original segment when it contains malformed percent encoding.
  }

  return decoded
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isSameSiteHost(candidate: URL, page: URL): boolean {
  const normalizeHost = (hostname: string) => hostname.toLowerCase().replace(/^www\./, '');
  return normalizeHost(candidate.hostname) === normalizeHost(page.hostname);
}

function isGenzToonsHost(hostname: string): boolean {
  return /(^|\.)genztoons\.(?:com|net|org)$/i.test(hostname);
}

function matchChapterNumberInUrl(value: string): RegExpMatchArray | null {
  // Some sites use opaque IDs after `/chapter/` (for example, `/chapter/64f1...`).
  // Require a separator/end after the number so an ID prefix is never treated
  // as the chapter number. Delimiters still allow routes like `chapter-64-vol-2`.
  return value.match(/(?:chapter|ch|ep|episode)[-_/](\d+(?:\.\d+)?)(?![a-z0-9])/i);
}

function matchChapterNumberInLabel(html: string): RegExpMatchArray | null {
  const labelText = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return labelText.match(/\b(?:chapter|episode)\s*(\d+(?:\.\d+)?)/i);
}

function extractGenzToonsChapters(
  html: string,
  pageUrl: URL,
  timestampPreference: 'rightmost' | 'newest' | 'oldest' | 'calendar' | 'relative',
): DetectedChapterItem[] {
  type GenzChapterLink = {
    href: string;
    label: RegExpMatchArray;
    routeKey: string;
    timestamp?: string;
  };

  const links: GenzChapterLink[] = [];
  const routeCounts = new Map<string, number>();
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let anchorMatch: RegExpExecArray | null;

  while ((anchorMatch = anchorRegex.exec(html)) !== null) {
    const attributes = anchorMatch[1];
    const innerHtml = anchorMatch[2];
    const hrefMatch = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3];
    if (!href) continue;

    let linkUrl: URL;
    try {
      linkUrl = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (!isSameSiteHost(linkUrl, pageUrl) || !/(?:^|\/)chapter\//i.test(linkUrl.pathname)) continue;

    const routeId = linkUrl.pathname.split('/').filter(Boolean).at(-1) || '';
    const routeKey = routeId.match(/^([a-z\d]{8,})-[a-z\d]{8,}$/i)?.[1] || '';
    // GenzToons' /chapter/<series-id>-<chapter-id> routes contain no chapter
    // number. Only accept a number explicitly shown in the link label/ARIA.
    let chapterLabel = matchChapterNumberInLabel(`${attributes} ${innerHtml}`);
    if (!chapterLabel) {
      const rowContext = extractChapterRowContext(
        html,
        anchorMatch.index,
        anchorMatch.index + anchorMatch[0].length,
        undefined,
        timestampPreference,
      );
      if (rowContext) chapterLabel = matchChapterNumberInLabel(rowContext);
    }
    if (!chapterLabel) continue;

    const number = Number.parseFloat(chapterLabel[1]);
    if (!Number.isFinite(number) || number < 0 || number >= 5000) continue;

    // GenzToons puts the posting age in the chapter anchor itself (for
    // example, "Chapter 11 New 8 hours ago"). Read that text directly, just
    // like the site's own chapter list, before looking at surrounding markup
    // that can contain the series' older calendar dates.
    const anchorText = innerHtml
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
    const postedText = anchorText
      .replace(/\bchapter\s+\d+(?:\.\d+)?/i, '')
      .replace(/\bNew\b/i, '')
      .trim();
    let timestamp = parseRelativeTime(postedText);
    if (!timestamp) {
      const datetimeMatch = innerHtml.match(/\bdatetime=["']([^"']+)["']/i);
      if (datetimeMatch) timestamp = parseRelativeTime(datetimeMatch[1]);
    }
    if (!timestamp) timestamp = extractTimeFromContext(`${attributes} ${innerHtml}`, timestampPreference);
    if (!timestamp) {
      const rowContext = extractChapterRowContext(
        html,
        anchorMatch.index,
        anchorMatch.index + anchorMatch[0].length,
        number,
        timestampPreference,
      );
      if (rowContext) timestamp = extractTimeFromContext(rowContext, timestampPreference);
    }

    links.push({
      href,
      label: chapterLabel,
      routeKey,
      ...(timestamp ? { timestamp: new Date(timestamp).toISOString() } : {}),
    });
    if (routeKey) routeCounts.set(routeKey, (routeCounts.get(routeKey) || 0) + 1);
  }

  // Chapter list entries share a series ID in the opaque route. Ignore any
  // other labeled chapter links on the same page that belong to recommendations.
  const primaryRouteKey = Array.from(routeCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  const chapters = new Map<number, DetectedChapterItem>();
  for (const link of links) {
    if (primaryRouteKey && link.routeKey !== primaryRouteKey) continue;
    const number = Number.parseFloat(link.label[1]);
    const existing = chapters.get(number);
    if (!existing) {
      chapters.set(number, {
        number,
        title: `Chapter ${link.label[1]}`,
        url: link.href,
        ...(link.timestamp ? { releasedAt: link.timestamp } : {}),
      });
    } else if (link.timestamp) {
      const existingTimestamp = existing.releasedAt ? Date.parse(existing.releasedAt) : Number.NaN;
      if (Number.isNaN(existingTimestamp) || Date.parse(link.timestamp) > existingTimestamp) {
        existing.releasedAt = link.timestamp;
      }
    }
  }

  return Array.from(chapters.values()).sort((a, b) => b.number - a.number);
}

function extractMistScanChapters(
  html: string,
  pageUrl: URL,
  seriesSlug: string,
  timestampPreference: 'rightmost' | 'newest' | 'oldest' | 'calendar' | 'relative',
): DetectedChapterItem[] {
  const normalizedSeriesSlug = normalizeSeriesPathSegment(seriesSlug);
  if (!normalizedSeriesSlug) return [];

  const chapters = new Map<number, DetectedChapterItem>();
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let anchorMatch: RegExpExecArray | null;

  while ((anchorMatch = anchorRegex.exec(html)) !== null) {
    const attributes = anchorMatch[1];
    const innerHtml = anchorMatch[2];
    const hrefMatch = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3];
    if (!href) continue;

    let linkUrl: URL;
    try {
      linkUrl = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (!isSameSiteHost(linkUrl, pageUrl)) continue;

    const decodedPath = (() => {
      try {
        return decodeURIComponent(linkUrl.pathname);
      } catch {
        return linkUrl.pathname;
      }
    })();
    const normalizedLinkPath = normalizeSeriesPathSegment(decodedPath);
    if (!normalizedLinkPath.startsWith(`${normalizedSeriesSlug}chapter`)) continue;

    // Mist Scans uses routes such as /solo-ex-rank-summoner-chapter-44.
    // Read the displayed chapter label first, then use this series-specific
    // route as a fallback when its link text contains only the date/actions.
    const visibleLabel = matchChapterNumberInLabel(`${attributes} ${innerHtml}`);
    const routeLabel = decodedPath.match(/chapter[-_/]?(\d+(?:\.\d+)?)(?:\/|$)/i);
    const chapterMatch = visibleLabel ?? routeLabel;
    if (!chapterMatch) continue;

    const number = Number.parseFloat(chapterMatch[1]);
    if (!Number.isFinite(number) || number < 0 || number >= 5000) continue;

    let timestamp = extractTimeFromContext(`${attributes} ${innerHtml}`, timestampPreference);
    if (!timestamp) {
      const rowContext = extractChapterRowContext(
        html,
        anchorMatch.index,
        anchorMatch.index + anchorMatch[0].length,
        number,
        timestampPreference,
      );
      if (rowContext) timestamp = extractTimeFromContext(rowContext, timestampPreference);
    }

    const existing = chapters.get(number);
    if (!existing) {
      chapters.set(number, {
        number,
        title: `Chapter ${chapterMatch[1]}`,
        url: href,
        releasedAt: timestamp ? new Date(timestamp).toISOString() : undefined,
      });
    } else if (timestamp) {
      const existingTimestamp = existing.releasedAt ? Date.parse(existing.releasedAt) : Number.NaN;
      if (Number.isNaN(existingTimestamp) || timestamp > existingTimestamp) {
        existing.releasedAt = new Date(timestamp).toISOString();
      }
    }
  }

  return Array.from(chapters.values()).sort((a, b) => b.number - a.number);
}

/**
 * Lagoon's series page can show only calendar dates while its homepage cards
 * show relative ages. Use the homepage age only when both the series permalink
 * and requested chapter are found in the same card/row.
 */
export function extractLagoonHomepageChapterTimestamp(
  html: string,
  homepageUrl: string,
  seriesUrl: string,
  chapterNumber: number,
  seriesTitle?: string,
): string | undefined {
  let homepage: URL;
  let series: URL;
  try {
    homepage = new URL(homepageUrl);
    series = new URL(seriesUrl);
  } catch {
    return undefined;
  }

  if (!/lagoon/i.test(homepage.hostname) || !isSameSiteHost(homepage, series)) return undefined;

  const seriesSlug = normalizeSeriesPathSegment(series.pathname.split('/').filter(Boolean).pop() || '');
  const normalizedSeriesTitle = normalizeSeriesPathSegment(seriesTitle || '');
  if (!seriesSlug) return undefined;

  const seriesAnchors: { start: number; end: number }[] = [];
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let anchorMatch: RegExpExecArray | null;
  while ((anchorMatch = anchorRegex.exec(html)) !== null) {
    const href = anchorMatch[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const candidate = new URL(href, homepage);
      const candidateSlug = normalizeSeriesPathSegment(candidate.pathname.split('/').filter(Boolean).pop() || '');
      const candidateTitle = normalizeSeriesPathSegment(matchChapterNumberInLabel(anchorMatch[2]) ? '' : anchorMatch[2].replace(/<[^>]+>/g, ' '));
      const sameTitle = normalizedSeriesTitle.length >= 8
        && candidateTitle.length >= 8
        && (candidateTitle.startsWith(normalizedSeriesTitle) || normalizedSeriesTitle.startsWith(candidateTitle));
      if (isSameSiteHost(candidate, series) && (candidateSlug === seriesSlug || sameTitle)) {
        seriesAnchors.push({ start: anchorMatch.index, end: anchorRegex.lastIndex });
      }
    } catch {
      // Ignore malformed or non-URL anchor targets.
    }
  }

  const relativeAgePattern =
    /(?:about\s+)?\d+(?:\.\d+)?\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?|[mhdwymo]\b)(?:\s*ago)?|\b(?:yesterday|just now|today)\b/i;

  for (const seriesAnchor of seriesAnchors) {
    const searchStart = Math.max(0, seriesAnchor.start - 15000);
    const prefix = html.slice(searchStart, seriesAnchor.start);
    const candidates: { index: number; tag: string }[] = [];
    const openingTags = /<(article|li|div|section)\b[^>]*>/gi;
    let opening: RegExpExecArray | null;
    while ((opening = openingTags.exec(prefix)) !== null) {
      candidates.push({ index: searchStart + opening.index, tag: opening[1].toLowerCase() });
    }

    // Try the nearest wrappers first; the first successful match is the
    // smallest card containing both this series link and its chapter row.
    for (let candidateIndex = candidates.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
      const candidate = candidates[candidateIndex];
      const tagRegex = new RegExp(`<\\/?${candidate.tag}\\b[^>]*>`, 'gi');
      tagRegex.lastIndex = candidate.index;
      let depth = 0;
      let tagMatch: RegExpExecArray | null;
      let regionEnd = -1;
      while ((tagMatch = tagRegex.exec(html)) !== null) {
        if (/^<\//.test(tagMatch[0])) {
          depth -= 1;
          if (depth === 0) {
            regionEnd = tagRegex.lastIndex;
            break;
          }
        } else {
          depth += 1;
        }
      }
      if (regionEnd < seriesAnchor.end) continue;

      const cardHtml = html.slice(candidate.index, regionEnd);
      const chapterAnchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
      const cardChapterAnchors: { start: number; end: number; number: number }[] = [];
      let chapterAnchor: RegExpExecArray | null;
      while ((chapterAnchor = chapterAnchorRegex.exec(cardHtml)) !== null) {
        const href = chapterAnchor[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || '';
        const chapterLabel = matchChapterNumberInLabel(chapterAnchor[2])
          ?? matchChapterNumberInUrl(href);
        if (!chapterLabel) continue;
        cardChapterAnchors.push({
          start: candidate.index + chapterAnchor.index,
          end: candidate.index + chapterAnchorRegex.lastIndex,
          number: Number.parseFloat(chapterLabel[1]),
        });
      }

      for (let chapterIndex = 0; chapterIndex < cardChapterAnchors.length; chapterIndex += 1) {
        const current = cardChapterAnchors[chapterIndex];
        if (current.number !== chapterNumber) continue;
        const previous = cardChapterAnchors[chapterIndex - 1];
        const next = cardChapterAnchors[chapterIndex + 1];
        const contextStart = previous
          ? Math.floor((previous.end + current.start) / 2)
          : Math.max(candidate.index, current.start - 700);
        const contextEnd = next
          ? Math.ceil((current.end + next.start) / 2)
          : Math.min(regionEnd, current.end + 700);
        const rowContext = html.slice(contextStart, contextEnd);
        if (!relativeAgePattern.test(rowContext)) continue;

        const timestamp = extractTimeFromContext(rowContext, 'relative');
        if (timestamp) return new Date(timestamp).toISOString();
      }
    }
  }

  return undefined;
}

export function extractPageLastUpdate(html: string): number | null {
  if (!html) return null;
  const patterns = [
    /\b(?:last\s*update|latest\s*update|updated)\b[\s\S]{0,120}?(?:about\s+)?(\d+(?:\.\d+)?\s*(?:seconds?|secs?|s\s*ago|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?|[mhdwymo]\b)(?:\s*ago)?|\b(?:yesterday|just now|today)\b)/i,
    /\b(?:last\s*update|latest\s*update|updated)\b[\s\S]{0,120}?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s*(?:\d{4})?)/i,
    /\b(?:last\s*update|latest\s*update|updated)\b[\s\S]{0,120}?(\d{4}-\d{2}-\d{2})/i,
  ];
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m && m[1]) {
      const ts = parseRelativeTime(m[1]);
      if (ts) return ts;
    }
  }
  return null;
}

export function extractChaptersFromHtml(
  html: string,
  pageUrl: string,
  _seriesTitle?: string,
): DetectedChapterItem[] {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(pageUrl);
  } catch {
    return [];
  }

  // 1. Clean HTML of noisy regions that contain other series
  const cleanHtml = html
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(
      /<(?:div|section)[^>]*class=["'][^"']*(?:recommend|related|sidebar|popular|trending|comments|discussion)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)>/gi,
      '',
    );

  const seriesPath = parsedUrl.pathname.replace(/\/+$/, '');
  const seriesSlug = seriesPath.split('/').filter(Boolean).pop() || '';
  const timestampPreference: 'rightmost' | 'newest' | 'oldest' | 'calendar' | 'relative' =
    isGenzToonsHost(parsedUrl.hostname) || /lagoon/i.test(parsedUrl.hostname)
      ? 'relative'
      : /(^|\.)nyxscans\.com$/i.test(parsedUrl.hostname)
      ? 'oldest'
      : /(^|\.)asurascans\.com$/i.test(parsedUrl.hostname)
        ? 'rightmost'
        : /(^|\.)qimanga\.com$/i.test(parsedUrl.hostname)
          ? 'calendar'
          : 'newest';

  const foundChapters = new Map<number, DetectedChapterItem>();

  if (isGenzToonsHost(parsedUrl.hostname)) {
    const genzToonsChapters = extractGenzToonsChapters(cleanHtml, parsedUrl, timestampPreference);
    if (genzToonsChapters.length > 0) return genzToonsChapters;
  }

  if (/(^|\.)mistscans\.org$/i.test(parsedUrl.hostname)) {
    for (const chapter of extractMistScanChapters(
      cleanHtml,
      parsedUrl,
      seriesSlug,
      timestampPreference,
    )) {
      foundChapters.set(chapter.number, chapter);
    }
  }

  // 2. Scan for chapter links with surrounding context for time extraction
  // We use a wider regex that captures the chapter link AND a chunk of surrounding HTML
  const chapterRowRegex =
    /<a\s+[^>]*href=["']([^"']*(?:chapter|ch|ep|episode)[-_/]\d[^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = chapterRowRegex.exec(cleanHtml)) !== null) {
    const href = m[1];
    const innerHtml = m[2];
    const fullMatchEnd = m.index + m[0].length;

    // Source page URLs and chapter links can encode punctuation differently
    // (for example, a curly apostrophe versus an ASCII apostrophe). Compare
    // normalized path segments before rejecting a series-style chapter URL.
    let chapterPath = href;
    try {
      chapterPath = new URL(href, parsedUrl).pathname;
    } catch {
      // Fall back to checking the href text itself.
    }
    const normalizedSeriesSlug = normalizeSeriesPathSegment(seriesSlug);
    const hasMatchingSeriesPathSegment = Boolean(normalizedSeriesSlug) && chapterPath
      .split('/')
      .filter(Boolean)
      .some((segment) => normalizeSeriesPathSegment(segment) === normalizedSeriesSlug);
    const isSeriesLink =
      (seriesSlug && href.includes(seriesSlug)) ||
      href.includes(seriesPath) ||
      hasMatchingSeriesPathSegment;

    if (!isSeriesLink) {
      // Reject links pointing to other series paths
      if (href.startsWith('/comics/') || href.startsWith('/series/') || href.startsWith('/manga/')) {
        continue;
      }
    }

    // Opaque chapter URLs may begin with an ID (for example `/chapter/64f1…`)
    // instead of the chapter number. In that case, use the visible label in
    // the chapter link rather than interpreting part of the ID as a number.
    const chapterMatch = matchChapterNumberInUrl(href) ?? matchChapterNumberInLabel(innerHtml);
    if (!chapterMatch) continue;

    const num = parseFloat(chapterMatch[1]);
    if (Number.isNaN(num) || num < 0 || num >= 5000) continue;

    // Prefer the chapter link itself, then its containing row. Do not search
    // arbitrary text before/after the link: that can belong to an adjacent row.
    let ts = extractTimeFromContext(innerHtml, timestampPreference);
    if (!ts) {
      const rowContext = extractChapterRowContext(cleanHtml, m.index, fullMatchEnd, num, timestampPreference);
      if (rowContext) ts = extractTimeFromContext(rowContext, timestampPreference);
    }

    if (!foundChapters.has(num)) {
      foundChapters.set(num, {
        number: num,
        title: `Chapter ${chapterMatch[1]}`,
        url: href,
        releasedAt: ts ? new Date(ts).toISOString() : undefined,
      });
    } else if (ts) {
      // A chapter can appear more than once in a page (for example, in a
      // featured item and in the chapter list). Keep the newest timestamp
      // reported for that same chapter instead of locking onto the first one.
      const existing = foundChapters.get(num)!;
      const existingTs = existing.releasedAt ? Date.parse(existing.releasedAt) : Number.NaN;
      if (Number.isNaN(existingTs) || ts > existingTs) {
        existing.releasedAt = new Date(ts).toISOString();
      }
    }
  }

  // Thunder Scans renders locked chapters as <li data-num="N"> rows. Those
  // rows have no chapter href, while a separate "New Chapter" link provides
  // the latest number without its date. Read the chapter number and date from
  // the same list row so the timestamp is not lost for locked chapters.
  if (/(^|\.)en-thunderscans\.com$/i.test(parsedUrl.hostname)) {
    const thunderRowRegex = /<li\b([^>]*)>([\s\S]*?)<\/li>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = thunderRowRegex.exec(cleanHtml)) !== null) {
      const attributes = rowMatch[1];
      const rowHtml = rowMatch[2];
      const dataNumMatch = attributes.match(/\bdata-num\s*=\s*["'](\d+(?:\.\d+)?)["']/i);
      if (!dataNumMatch || !/class=["'][^"']*chapternum/i.test(rowHtml)) continue;

      const num = parseFloat(dataNumMatch[1]);
      if (Number.isNaN(num) || num < 0 || num >= 5000) continue;
      const ts = extractTimeFromContext(rowHtml, timestampPreference);
      const existing = foundChapters.get(num);
      if (!existing) {
        foundChapters.set(num, {
          number: num,
          title: `Chapter ${dataNumMatch[1]}`,
          releasedAt: ts ? new Date(ts).toISOString() : undefined,
        });
      } else if (ts) {
        const existingTs = existing.releasedAt ? Date.parse(existing.releasedAt) : Number.NaN;
        if (Number.isNaN(existingTs) || ts > existingTs) {
          existing.releasedAt = new Date(ts).toISOString();
        }
      }
    }
  }

  // Some series pages use chapter URLs that do not include the word "chapter"
  // (or expose the chapter number only in the link text). If the standard
  // route-based scan found nothing, inspect same-site anchors labelled
  // "Chapter N" as a conservative fallback. Recommendations and sidebars
  // have already been removed from cleanHtml above.
  if (foundChapters.size === 0) {
    const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    while ((m = anchorRegex.exec(cleanHtml)) !== null) {
      const attributes = m[1];
      const innerHtml = m[2];
      const hrefMatch = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3];
      if (!href) continue;

      let linkUrl: URL;
      try {
        linkUrl = new URL(href, parsedUrl);
      } catch {
        continue;
      }
      if (!isSameSiteHost(linkUrl, parsedUrl)) continue;

      const anchorText = innerHtml
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const chapterMatch = anchorText.match(/\bchapter\s*(\d+(?:\.\d+)?)/i)
        || matchChapterNumberInUrl(href);
      if (!chapterMatch) continue;

      const num = parseFloat(chapterMatch[1]);
      if (Number.isNaN(num) || num < 0 || num >= 5000) continue;

      let ts = extractTimeFromContext(innerHtml, timestampPreference);
      if (!ts) {
        const rowContext = extractChapterRowContext(cleanHtml, m.index, m.index + m[0].length, num, timestampPreference);
        if (rowContext) ts = extractTimeFromContext(rowContext, timestampPreference);
      }

      if (!foundChapters.has(num)) {
        foundChapters.set(num, {
          number: num,
          title: `Chapter ${chapterMatch[1]}`,
          url: href,
          releasedAt: ts ? new Date(ts).toISOString() : undefined,
        });
      } else if (ts) {
        const existing = foundChapters.get(num)!;
        const existingTs = existing.releasedAt ? Date.parse(existing.releasedAt) : Number.NaN;
        if (Number.isNaN(existingTs) || ts > existingTs) {
          existing.releasedAt = new Date(ts).toISOString();
        }
      }
    }
  }

  // 3. Also check for non-link chapter rows (aria-label patterns, Qi Manga style)
  const ariaRegex =
    /<(?:a|div|li)[^>]*aria-label=["']Chapter\s*(\d+(?:\.\d+)?)["'][^>]*>([\s\S]*?)(?:<\/(?:a|div|li)>)/gi;
  while ((m = ariaRegex.exec(cleanHtml)) !== null) {
    const num = parseFloat(m[1]);
    if (Number.isNaN(num) || num < 0 || num >= 5000) continue;
    let ts = extractTimeFromContext(m[2], timestampPreference);
    if (!ts) {
      const rowContext = extractChapterRowContext(
        cleanHtml,
        m.index,
        m.index + m[0].length,
        num,
        timestampPreference,
      );
      if (rowContext) ts = extractTimeFromContext(rowContext, timestampPreference);
    }
    if (foundChapters.has(num)) {
      const existing = foundChapters.get(num)!;
      if (ts) {
        const existingTs = existing.releasedAt ? Date.parse(existing.releasedAt) : Number.NaN;
        if (Number.isNaN(existingTs) || ts > existingTs) {
          existing.releasedAt = new Date(ts).toISOString();
        }
      }
      continue;
    }
    foundChapters.set(num, {
      number: num,
      title: `Chapter ${m[1]}`,
      releasedAt: ts ? new Date(ts).toISOString() : undefined,
    });
  }

  const chapterList = Array.from(foundChapters.values()).sort((a, b) => b.number - a.number);
  if (chapterList.length > 0 && !chapterList[0].releasedAt) {
    const pageLastUpdate = extractPageLastUpdate(cleanHtml);
    if (pageLastUpdate) {
      chapterList[0].releasedAt = new Date(pageLastUpdate).toISOString();
    }
  }
  return chapterList;
}

