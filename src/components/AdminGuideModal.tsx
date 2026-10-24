import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  BookText,
  Brush,
  Check,
  ChevronLeft,
  ChevronRight,
  Smartphone,
} from 'lucide-react';
import type { SeriesRecord } from '../lib/seriesCatalog';

type AdminGuideFormat = 'Manga' | 'Manhwa' | 'Manhua' | 'Novels';

const GUIDE_FORMATS: { name: AdminGuideFormat; description: string; Icon: typeof BookOpen }[] = [
  { name: 'Manga', description: 'Japanese comics', Icon: BookOpen },
  { name: 'Manhwa', description: 'Korean webtoons', Icon: Smartphone },
  { name: 'Manhua', description: 'Chinese comics', Icon: Brush },
  { name: 'Novels', description: 'Light and web novels', Icon: BookText },
];

const GUIDE_GENRES = [
  'Action', 'Fantasy', 'Drama', 'Shounen', 'Adventure', 'Martial Arts', 'Comedy',
  'Supernatural', 'System', 'Murim', 'Revenge', 'Seinen', 'Reincarnation', 'Romance',
  'Historical', 'Video Games', 'School Life', 'Monsters', 'Shoujo', 'Slice Of Life',
  'Sports', 'Survival', 'Horror', 'Mystery', 'Isekai', 'Thriller', 'Sci-Fi',
];

type AdminGuideModalProps = {
  userId: string;
  catalogItems: SeriesRecord[];
};

export default function AdminGuideModal({ userId, catalogItems }: AdminGuideModalProps) {
  const storageKey = `comix-admin-reader-setup:${userId}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === null;
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(1);
  const [formats, setFormats] = useState<AdminGuideFormat[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<number[]>([]);
  const [finding, setFinding] = useState(false);

  const finishGuide = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ completed: true, formats, genres, followedSeries: selectedSeries }));
    } catch {
      // Keep the guide dismissible when browser storage is unavailable.
    }
    setOpen(false);
  }, [formats, genres, selectedSeries, storageKey]);

  useEffect(() => {
    if (!finding) return;
    const timer = window.setTimeout(() => {
      setFinding(false);
      setStep(3);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [finding]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finishGuide();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [finishGuide, open]);

  const toggleFormat = (format: AdminGuideFormat) => {
    setFormats((current) => current.includes(format)
      ? current.filter((item) => item !== format)
      : [...current, format]);
  };

  const toggleGenre = (genre: string) => {
    setGenres((current) => current.includes(genre)
      ? current.filter((item) => item !== genre)
      : [...current, genre]);
  };

  const recommendations = useMemo(() => catalogItems
    .map((series) => {
      const genreMatches = series.genres.filter((genre) => genres.some((picked) => picked.toLowerCase() === genre.toLowerCase())).length;
      const normalizedCategory = series.category.toLowerCase();
      const formatMatches = formats.some((format) => {
        const category = format === 'Novels' ? 'novel' : format.toLowerCase();
        return normalizedCategory.includes(category);
      });
      return { series, score: genreMatches * 2 + (formatMatches ? 1 : 0) };
    })
    .filter(({ series }) => Boolean(series.cover))
    .sort((a, b) => b.score - a.score || a.series.title.localeCompare(b.series.title))
    .slice(0, 12)
    .map(({ series }) => series), [catalogItems, formats, genres]);

  if (!open) return null;

  return (
    <div className="admin-guide-backdrop" role="presentation">
      <section className="admin-guide-modal" role="dialog" aria-modal="true" aria-labelledby="admin-guide-title">
        <aside className="admin-guide-brand-panel">
          <div className="admin-guide-eyebrow">NEW READER SETUP</div>
          <h2 id="admin-guide-title">Let’s build your shelf</h2>
          <p>Three quick picks and your home page is tuned to you.</p>
          <div className="admin-guide-cover-stack" aria-hidden="true">
            {catalogItems.slice(0, 3).map((series) => (
              <img key={series.id} src={series.cover} alt="" />
            ))}
          </div>
        </aside>

        <div className="admin-guide-content">
          <div className="admin-guide-stepbar">
            <strong>{finding ? 'Building your shelf' : step === 3 ? 'Step 3 of 3' : `Step ${step} of 3`}</strong>
            <button type="button" onClick={finishGuide}>Skip for now</button>
            <div className="admin-guide-progress" aria-label={`Step ${step} of 3`}>
              {[1, 2, 3].map((part) => <span key={part} className={part <= (finding ? 3 : step) ? 'is-active' : ''} />)}
            </div>
          </div>

          {finding ? (
            <div className="admin-guide-finding">
              <div className="admin-guide-loading-covers">
                {recommendations.slice(0, 2).map((series) => <img key={series.id} src={series.cover} alt="" />)}
              </div>
              <h3>Finding series you’ll love</h3>
              <p>Scanning {genres.slice(0, 2).join(' and ') || 'your picks'}…</p>
              <div className="admin-guide-loading-bar"><span /></div>
            </div>
          ) : step === 1 ? (
            <>
              <h3>What do you like to read?</h3>
              <p className="admin-guide-subtitle">Pick as many as you like. You can change this anytime.</p>
              <div className="admin-guide-format-grid">
                {GUIDE_FORMATS.map(({ name, description, Icon }) => {
                  const active = formats.includes(name);
                  return (
                    <button key={name} type="button" className={`admin-guide-format${active ? ' is-selected' : ''}`} onClick={() => toggleFormat(name)} aria-pressed={active}>
                      <Icon size={22} />
                      <strong>{name}</strong>
                      <span>{description}</span>
                      {active && <i><Check size={14} /></i>}
                    </button>
                  );
                })}
              </div>
              <div className="admin-guide-actions"><button type="button" className="admin-guide-primary" onClick={() => setStep(2)}>Continue <ChevronRight size={17} /></button></div>
            </>
          ) : step === 2 ? (
            <>
              <div className="admin-guide-heading-row"><div><h3>Pick 3 or more genres</h3><p className="admin-guide-subtitle">We’ll use these to fill your home page.</p></div><span className="admin-guide-picked-count">{genres.length} picked</span></div>
              <div className="admin-guide-genre-list">
                {GUIDE_GENRES.map((genre) => {
                  const active = genres.includes(genre);
                  return <button key={genre} type="button" className={`admin-guide-genre${active ? ' is-selected' : ''}`} onClick={() => toggleGenre(genre)} aria-pressed={active}>{active && <Check size={14} />}{genre}</button>;
                })}
              </div>
              <div className="admin-guide-actions admin-guide-actions-split">
                <button type="button" className="admin-guide-secondary" onClick={() => setStep(1)}><ChevronLeft size={17} /> Back</button>
                <button type="button" className="admin-guide-primary" disabled={genres.length < 3} onClick={() => setFinding(true)}>Find my series <ChevronRight size={17} /></button>
              </div>
            </>
          ) : (
            <>
              <h3>Picked for you</h3>
              <p className="admin-guide-subtitle">Ranked by how well they match your genres. Tap to follow.</p>
              <div className="admin-guide-recommendations">
                {recommendations.map((series) => {
                  const active = selectedSeries.includes(series.id);
                  return <button type="button" key={series.id} className={`admin-guide-series${active ? ' is-selected' : ''}`} onClick={() => setSelectedSeries((current) => active ? current.filter((id) => id !== series.id) : [...current, series.id])} aria-pressed={active} title={series.title}>
                    <img src={series.cover} alt="" loading="lazy" />
                    <span>{series.title}</span>
                    <i>{active ? <Check size={15} /> : <span>+</span>}</i>
                  </button>;
                })}
                {!recommendations.length && <p className="admin-guide-empty">No matching series found yet. You can finish without following any.</p>}
              </div>
              <div className="admin-guide-actions admin-guide-actions-split">
                <button type="button" className="admin-guide-secondary" onClick={() => setStep(2)}><ChevronLeft size={17} /> Back</button>
                <button type="button" className="admin-guide-primary" onClick={finishGuide}>{selectedSeries.length ? `Follow ${selectedSeries.length} selected` : 'Finish without following'}</button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
