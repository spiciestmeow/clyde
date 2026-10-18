import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CirclePlus,
  Database,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  createSeriesRecord,
  importOriginalCatalog,
  SERIES_CATALOG_QUERY_KEY,
  type CreateSeriesRequest,
  type SeriesLink,
  type SeriesRecord,
} from '../lib/seriesCatalog';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import './series-catalog-manager.css';

type LinkDraft = { name: string; url: string; logo: string; isSample: boolean };
type FormDraft = {
  title: string;
  cover: string;
  category: string;
  status: string;
  synopsis: string;
  alternateTitles: string;
  author: string;
  artist: string;
  publishers: string;
  contentRating: string;
  year: string;
  originalLanguage: string;
  demographics: string[];
  genres: string;
  formats: string;
  tags: string;
  trackers: LinkDraft[];
  sources: LinkDraft[];
};

const emptyForm = (): FormDraft => ({
  title: '', cover: '', category: 'Manhwa', status: 'Ongoing', synopsis: '',
  alternateTitles: '', author: '', artist: '', publishers: '', contentRating: 'Safe',
  year: '', originalLanguage: '', demographics: [], genres: '', formats: '', tags: '',
  trackers: [], sources: [],
});
const splitList = (value: string) => value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
const languageOptions = ['Korean', 'Japanese', 'Chinese', 'English', 'Other'];
const demographicOptions = ['Shounen', 'Shoujo', 'Seinen', 'Josei', 'Webtoon'];

function LinkEditor({
  label,
  links,
  onChange,
}: {
  label: string;
  links: LinkDraft[];
  onChange: (links: LinkDraft[]) => void;
}) {
  const update = (index: number, key: keyof LinkDraft, value: string | boolean) => {
    onChange(links.map((link, current) => current === index ? { ...link, [key]: value } : link));
  };
  const add = () => onChange([...links, { name: '', url: '', logo: '', isSample: false }]);
  return (
    <div className="scm-link-editor">
      {links.map((link, index) => (
        <div className="scm-link-row" key={`${label}-${index}`}>
          <label className="scm-field">
            <span>{label} name</span>
            <input value={link.name} onChange={(event) => update(index, 'name', event.target.value)} placeholder="e.g. MangaUpdates" data-testid={`input-${label.toLowerCase()}-name-${index}`} />
          </label>
          <label className="scm-field scm-link-url">
            <span>URL</span>
            <input type="url" value={link.url} onChange={(event) => update(index, 'url', event.target.value)} placeholder="https://" data-testid={`input-${label.toLowerCase()}-url-${index}`} />
          </label>
          <label className="scm-field scm-link-logo">
            <span>Logo URL <small>Optional</small></span>
            <input type="url" value={link.logo} onChange={(event) => update(index, 'logo', event.target.value)} placeholder="https://" data-testid={`input-${label.toLowerCase()}-logo-${index}`} />
          </label>
          <button type="button" className="scm-icon-button scm-remove-link" aria-label={`Remove ${label} link ${index + 1}`} onClick={() => onChange(links.filter((_, current) => current !== index))} data-testid={`button-remove-${label.toLowerCase()}-${index}`}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button type="button" className="scm-add-link" onClick={add} data-testid={`button-add-${label.toLowerCase()}`}>
        <Plus size={14} /> Add {label.toLowerCase()}
      </button>
    </div>
  );
}

function TokenField({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint?: string }) {
  return (
    <label className="scm-field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Separate entries with commas" data-testid={`input-${label.toLowerCase().replaceAll(' ', '-')}`} />
      {hint && <small className="scm-hint">{hint}</small>}
    </label>
  );
}

function SeriesRow({ series }: { series: SeriesRecord }) {
  return (
    <article className="scm-series-row" data-testid={`row-series-${series.id}`}>
      <div className="scm-row-cover">
        {series.cover ? <img src={series.cover} alt="" loading="lazy" /> : <BookOpen size={17} />}
      </div>
      <div className="scm-row-main">
        <strong>{series.title}</strong>
        <span>{series.category || 'Unclassified'} <i /> {series.status || 'Status not set'}</span>
      </div>
      <span className="scm-row-chapters">{series.chapters?.length ?? 0}<small>CHAPTERS</small></span>
      <a href={series.href || `/series/${series.slug}`} target="_blank" rel="noreferrer" className="scm-row-open" aria-label={`Open ${series.title} public page`} data-testid={`link-series-${series.id}`}>
        <ExternalLink size={15} />
      </a>
    </article>
  );
}

export default function SeriesCatalogManager() {
  const queryClient = useQueryClient();
  const catalogQuery = useSeriesCatalog();
  const [draft, setDraft] = useState<FormDraft>(emptyForm);
  const [query, setQuery] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const createSeriesMutation = useMutation({
    mutationFn: createSeriesRecord,
    onSuccess: async (series) => {
      await queryClient.invalidateQueries({ queryKey: SERIES_CATALOG_QUERY_KEY });
      setSuccessMessage(`${series.title} was added to the catalog.`);
      setDraft(emptyForm());
    },
  });
  const importCatalog = useMutation({
    mutationFn: importOriginalCatalog,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: SERIES_CATALOG_QUERY_KEY });
      setImportMessage(`Catalog checked. ${result.insertedCount} ${result.insertedCount === 1 ? 'title was' : 'titles were'} added; ${result.totalCount} titles now available.`);
    },
  });
  const catalog = catalogQuery.data;
  const visibleSeries = useMemo(() => {
    const items = catalog?.items ?? [];
    const term = query.trim().toLocaleLowerCase();
    if (!term) return items;
    return items.filter((item) => [item.title, item.slug, item.category, ...item.alternateTitles].some((value) => value?.toLocaleLowerCase().includes(term)));
  }, [catalog?.items, query]);

  const set = <K extends keyof FormDraft>(key: K, value: FormDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const toggleDemographic = (value: string) => set('demographics', draft.demographics.includes(value)
    ? draft.demographics.filter((item) => item !== value)
    : [...draft.demographics, value]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setSuccessMessage('');
    const title = draft.title.trim();
    if (!title) {
      setFormError('A series title is required.');
      return;
    }
    if (draft.cover.trim() && !/^https?:\/\/\S+$/i.test(draft.cover.trim())) {
      setFormError('Enter a valid image URL beginning with http:// or https://.');
      return;
    }
    const links = (items: LinkDraft[]): SeriesLink[] => items
      .filter((item) => item.name.trim() && item.url.trim())
      .map((item) => ({ name: item.name.trim(), url: item.url.trim(), ...(item.logo.trim() ? { logo: item.logo.trim() } : {}), ...(item.isSample ? { isSample: true } : {}) }));
    const payload: CreateSeriesRequest = {
      title,
      ...(draft.cover.trim() ? { cover: draft.cover.trim() } : {}),
      ...(draft.category ? { category: draft.category } : {}),
      ...(draft.status ? { status: draft.status } : {}),
      ...(draft.synopsis.trim() ? { synopsis: draft.synopsis.trim() } : {}),
      ...(splitList(draft.alternateTitles).length ? { alternateTitles: splitList(draft.alternateTitles) } : {}),
      ...(draft.author.trim() ? { author: draft.author.trim() } : {}),
      ...(draft.artist.trim() ? { artist: draft.artist.trim() } : {}),
      ...(splitList(draft.publishers).length ? { publishers: splitList(draft.publishers) } : {}),
      ...(draft.contentRating ? { contentRating: draft.contentRating } : {}),
      ...(draft.year ? { year: Number(draft.year) } : {}),
      ...(draft.originalLanguage ? { originalLanguage: draft.originalLanguage } : {}),
      ...(draft.demographics.length ? { demographics: draft.demographics } : {}),
      ...(splitList(draft.genres).length ? { genres: splitList(draft.genres) } : {}),
      ...(splitList(draft.formats).length ? { formats: splitList(draft.formats) } : {}),
      ...(splitList(draft.tags).length ? { tags: splitList(draft.tags) } : {}),
      ...(links(draft.trackers).length ? { trackers: links(draft.trackers) } : {}),
      ...(links(draft.sources).length ? { sources: links(draft.sources) } : {}),
    };
    createSeriesMutation.mutate(payload, {
      onError: () => setFormError('The series could not be saved. Check the details and your admin connection, then try again.'),
    });
  };

  const importError = importCatalog.isError ? 'The original catalog could not be imported. Check your admin connection and try again.' : '';
  const loadError = catalogQuery.isError ? 'We could not load the series catalog. Your existing titles have not been changed.' : '';

  return (
    <section className="scm-root" aria-labelledby="scm-heading">
      <div className="scm-heading">
        <div>
          <div className="scm-kicker"><span /> CATALOG MANAGEMENT</div>
          <h2 id="scm-heading">Series catalog</h2>
          <p>Add a fully described series or restore missing entries from the original catalog.</p>
        </div>
        <div className="scm-count" aria-live="polite">
          <strong>{catalogQuery.isLoading ? '—' : (catalog?.totalCount ?? 0).toLocaleString()}</strong>
          <span>CATALOG TITLES</span>
        </div>
      </div>

      <div className="scm-import-banner">
        <div className="scm-import-icon"><Database size={18} /></div>
        <div className="scm-import-copy">
          <strong>Restore original catalog</strong>
          <span>Safely add original titles that are missing. Existing entries are preserved.</span>
          {importMessage && <small className="scm-success-inline" role="status"><Check size={13} />{importMessage}</small>}
          {importError && <small className="scm-error-inline" role="alert">{importError}</small>}
        </div>
        <button className="scm-secondary-button" type="button" onClick={() => { setImportMessage(''); importCatalog.mutate(); }} disabled={importCatalog.isPending} data-testid="button-import-original">
          {importCatalog.isPending ? <LoaderCircle className="scm-spin" size={15} /> : <RefreshCw size={15} />}
          {importCatalog.isPending ? 'Checking catalog' : 'Import missing titles'}
        </button>
      </div>

      <div className="scm-workspace">
        <section className="scm-catalog-panel" aria-labelledby="scm-existing-heading">
          <div className="scm-panel-header">
            <div>
              <span className="scm-section-index">01 / CATALOG</span>
              <h3 id="scm-existing-heading">Existing series</h3>
            </div>
            <span className="scm-result-count">{visibleSeries.length} shown</span>
          </div>
          <label className="scm-search">
            <Search size={16} />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, aliases, category…" aria-label="Search series catalog" data-testid="input-catalog-search" />
            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} data-testid="button-clear-search"><X size={14} /></button>}
          </label>
          {catalogQuery.isLoading && (
            <div className="scm-series-list" aria-label="Loading catalog">
              {[0, 1, 2, 3].map((item) => <div className="scm-skeleton-row" key={item}><span /><div><i /><i /></div></div>)}
            </div>
          )}
          {!catalogQuery.isLoading && loadError && (
            <div className="scm-state scm-state-error" role="alert">
              <AlertCircle size={20} /><strong>Catalog unavailable</strong><span>{loadError}</span>
              <button type="button" className="scm-tertiary-button" onClick={() => void catalogQuery.refetch()} data-testid="button-retry-catalog"><RefreshCw size={14} /> Try again</button>
            </div>
          )}
          {!catalogQuery.isLoading && !catalogQuery.isError && catalog && visibleSeries.length === 0 && (
            <div className="scm-state">
              <div className="scm-empty-mark"><BookOpen size={20} /></div>
              <strong>{query ? 'No matching series' : 'No series yet'}</strong>
              <span>{query ? 'Try another title or clear your search.' : 'Create your first series or restore missing original titles.'}</span>
              {query && <button type="button" className="scm-tertiary-button" onClick={() => setQuery('')} data-testid="button-reset-search">Clear search</button>}
            </div>
          )}
          {!catalogQuery.isLoading && !catalogQuery.isError && visibleSeries.length > 0 && (
            <div className="scm-series-list">{visibleSeries.map((series) => <SeriesRow key={series.id} series={series} />)}</div>
          )}
          <div className="scm-catalog-foot"><span><span className="scm-live-dot" /> Live catalog</span><span>PUBLIC SERIES <ArrowUpRight size={12} /></span></div>
        </section>

        <form className="scm-create-panel" onSubmit={submit} noValidate>
          <div className="scm-panel-header scm-create-header">
            <div>
              <span className="scm-section-index">02 / NEW ENTRY</span>
              <h3>Create a series</h3>
              <p>Build a complete reader-facing series page.</p>
            </div>
            <div className="scm-create-badge"><Sparkles size={14} /> NEW</div>
          </div>

          {successMessage && <div className="scm-form-success" role="status"><Check size={16} /><span>{successMessage}</span></div>}
          {formError && <div className="scm-form-error" role="alert"><AlertCircle size={16} /><span>{formError}</span></div>}

          <div className="scm-form-content">
            <section className="scm-form-section">
              <div className="scm-form-section-heading"><span>01</span><div><h4>Basics</h4><p>Start with the title and cover artwork.</p></div></div>
              <div className="scm-cover-area">
                <div className={`scm-cover-preview ${previewFailed ? 'has-error' : ''}`}>
                  {draft.cover && !previewFailed
                    ? <img src={draft.cover} alt="Series cover preview" onError={() => setPreviewFailed(true)} onLoad={() => setPreviewFailed(false)} />
                    : <div className="scm-cover-placeholder"><ImageIcon size={22} /><span>{previewFailed ? 'Preview unavailable' : 'COVER ART'}</span></div>}
                </div>
                <div className="scm-cover-input">
                  <label className="scm-field">
                    <span>Cover image URL <small>Optional</small></span>
                    <input type="url" value={draft.cover} onChange={(event) => { set('cover', event.target.value); setPreviewFailed(false); }} placeholder="https://…/cover.jpg" data-testid="input-series-cover" />
                  </label>
                  <small className="scm-hint">Paste a direct image URL. Artwork appears in the public catalog.</small>
                </div>
              </div>
              <label className="scm-field">
                <span>Series title <b>Required</b></span>
                <input required maxLength={160} value={draft.title} onChange={(event) => set('title', event.target.value)} placeholder="Enter the official series title" data-testid="input-series-title" />
              </label>
              <TokenField label="Alternate titles" value={draft.alternateTitles} onChange={(value) => set('alternateTitles', value)} hint="Include original-language titles or common aliases." />
              <label className="scm-field">
                <span>Synopsis <small>Optional</small></span>
                <textarea maxLength={12000} rows={4} value={draft.synopsis} onChange={(event) => set('synopsis', event.target.value)} placeholder="A concise introduction to the story…" data-testid="input-series-synopsis" />
                <small className="scm-character-count">{draft.synopsis.length.toLocaleString()} / 12,000</small>
              </label>
            </section>

            <section className="scm-form-section">
              <div className="scm-form-section-heading"><span>02</span><div><h4>Credits</h4><p>Attribute the creative team and publishers.</p></div></div>
              <div className="scm-field-grid">
                <label className="scm-field"><span>Author</span><input value={draft.author} onChange={(event) => set('author', event.target.value)} placeholder="Author name" data-testid="input-series-author" /></label>
                <label className="scm-field"><span>Artist</span><input value={draft.artist} onChange={(event) => set('artist', event.target.value)} placeholder="Artist name" data-testid="input-series-artist" /></label>
              </div>
              <TokenField label="Publishers" value={draft.publishers} onChange={(value) => set('publishers', value)} />
            </section>

            <section className="scm-form-section">
              <div className="scm-form-section-heading"><span>03</span><div><h4>Classification</h4><p>Set the format, readership, and release details.</p></div></div>
              <div className="scm-field-grid">
                <label className="scm-field"><span>Type</span><span className="scm-select-wrap"><select value={draft.category} onChange={(event) => set('category', event.target.value)} data-testid="select-series-type"><option>Manhwa</option><option>Manga</option><option>Manhua</option><option>Comic</option><option>Novel</option></select><ChevronDown size={14} /></span></label>
                <label className="scm-field"><span>Content rating</span><span className="scm-select-wrap"><select value={draft.contentRating} onChange={(event) => set('contentRating', event.target.value)} data-testid="select-series-rating"><option>Safe</option><option>Suggestive</option><option>Erotica</option><option>Adult</option></select><ChevronDown size={14} /></span></label>
                <label className="scm-field"><span>Status</span><span className="scm-select-wrap"><select value={draft.status} onChange={(event) => set('status', event.target.value)} data-testid="select-series-status"><option>Ongoing</option><option>Completed</option><option>Hiatus</option><option>Cancelled</option></select><ChevronDown size={14} /></span></label>
                <label className="scm-field"><span>Year</span><input type="number" min="1900" max="2100" value={draft.year} onChange={(event) => set('year', event.target.value)} placeholder="e.g. 2024" data-testid="input-series-year" /></label>
                <label className="scm-field scm-grid-full"><span>Original language</span><span className="scm-select-wrap"><select value={draft.originalLanguage} onChange={(event) => set('originalLanguage', event.target.value)} data-testid="select-series-language"><option value="">Select a language</option>{languageOptions.map((language) => <option key={language}>{language}</option>)}</select><ChevronDown size={14} /></span></label>
              </div>
              <div className="scm-field scm-demographics">
                <span>Demographic</span>
                <div className="scm-chip-list">{demographicOptions.map((item) => <button key={item} type="button" className={`scm-chip ${draft.demographics.includes(item) ? 'is-selected' : ''}`} onClick={() => toggleDemographic(item)} aria-pressed={draft.demographics.includes(item)} data-testid={`toggle-demographic-${item.toLowerCase()}`}>{item}</button>)}</div>
              </div>
            </section>

            <section className="scm-form-section">
              <div className="scm-form-section-heading"><span>04</span><div><h4>Categorization</h4><p>Help readers find this series.</p></div></div>
              <TokenField label="Genres" value={draft.genres} onChange={(value) => set('genres', value)} hint="Separate each genre with a comma." />
              <TokenField label="Formats" value={draft.formats} onChange={(value) => set('formats', value)} />
              <TokenField label="Tags" value={draft.tags} onChange={(value) => set('tags', value)} />
            </section>

            <section className="scm-form-section">
              <div className="scm-form-section-heading"><span>05</span><div><h4>Trackers</h4><p>Link readers to external series listings.</p></div></div>
              <LinkEditor label="Tracker" links={draft.trackers} onChange={(links) => set('trackers', links)} />
            </section>
            <section className="scm-form-section scm-last-section">
              <div className="scm-form-section-heading"><span>06</span><div><h4>Sources</h4><p>Add reader links for this series.</p></div></div>
              <LinkEditor label="Source" links={draft.sources} onChange={(links) => set('sources', links)} />
            </section>
          </div>
          <div className="scm-form-actions">
            <button type="button" className="scm-cancel-button" onClick={() => { setDraft(emptyForm()); setFormError(''); setSuccessMessage(''); }} disabled={createSeriesMutation.isPending} data-testid="button-reset-series">Reset form</button>
            <button type="submit" className="scm-primary-button" disabled={createSeriesMutation.isPending || !draft.title.trim()} data-testid="button-create-series">
              {createSeriesMutation.isPending ? <><LoaderCircle className="scm-spin" size={16} /> Creating series</> : <><CirclePlus size={16} /> Create series</>}
            </button>
          </div>
        </form>
      </div>
      <div className="scm-panel-note"><Check size={14} /><span>Changes are written to the live public catalog. Existing series are never overwritten.</span></div>
    </section>
  );
}
