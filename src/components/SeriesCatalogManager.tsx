import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Edit2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  List,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  createSeriesRecord,
  updateSeriesRecord,
  deleteSeriesRecord,
  SERIES_CATALOG_QUERY_KEY,
  type CreateSeriesRequest,
  type UpdateSeriesRequest,
  type SeriesLink,
  type SeriesRecord,
} from '../lib/seriesCatalog';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import { fetchMangaDexDetails } from '../lib/mangadex';
import './series-catalog-manager.css';

type LinkDraft = { name: string; url: string; logo: string; isSample: boolean };

type FormDraft = {
  title: string;
  cover: string;
  category: string;
  status: string;
  synopsis: string;
  alternateTitles: string[];
  authors: string[];
  artists: string[];
  publishers: string[];
  contentRating: string;
  year: string;
  originalLanguage: string;
  demographics: string[];
  genres: string[];
  formats: string[];
  tags: string[];
  trackers: LinkDraft[];
  sources: LinkDraft[];
};

const ALL_GENRES = [
  'Action', 'Adult', 'Adventure', 'Boys Love', 'Comedy', 'Crime', 'Drama', 'Ecchi',
  'Fantasy', 'Girls Love', 'Harem', 'Hentai', 'Historical', 'Horror', 'Isekai',
  'Magical Girls', 'Mecha', 'Medical', 'Mystery', 'Philosophical', 'Psychological',
  'Romance', 'Sci-Fi', 'Slice of Life', 'Smut', 'Sports', 'Superhero', 'Thriller',
  'Tragedy', 'Wuxia'
];

const ALL_FORMATS = [
  '4-Koma', 'Adaptation', 'Anthology', 'Award Winning', 'Doujinshi', 'Full Color',
  'Long Strip', 'Oneshot', 'Web Comic'
];

const ALL_DEMOGRAPHICS = ['Josei', 'Seinen', 'Shoujo', 'Shounen'];
const ALL_TYPES = ['Manga', 'Manhwa', 'Manhua', 'Comic', 'Novel'];
const ALL_RATINGS = ['Safe', 'Suggestive', 'Erotica', 'Pornographic'];
const ALL_STATUSES = ['Releasing', 'Completed', 'Hiatus', 'Cancelled'];
const ALL_LANGUAGES = ['Japanese', 'Korean', 'Chinese', 'English', 'Other'];

const initialFormDraft = (): FormDraft => ({
  title: '',
  cover: '',
  category: 'Manga',
  status: 'Releasing',
  synopsis: '',
  alternateTitles: [],
  authors: [],
  artists: [],
  publishers: [],
  contentRating: 'Safe',
  year: '',
  originalLanguage: 'Japanese',
  demographics: [],
  genres: [],
  formats: [],
  tags: [],
  trackers: [],
  sources: [],
});

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function SeriesCatalogManager() {
  const queryClient = useQueryClient();
  const catalogQuery = useSeriesCatalog();
  const catalogItems = catalogQuery.items;

  // View state: 'list' (Image 1) or 'new-title' (Image 3)
  const [view, setView] = useState<'list' | 'new-title'>('list');
  // Modal state: Image 2 "Upload chapter" dialog
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Main tabs: 'titles' or 'chapters'
  const [mainTab, setMainTab] = useState<'titles' | 'chapters'>('titles');

  // List filters
  const [listSearch, setListSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [statusFilter, setStatusFilter] = useState('All statuses');

  // Modal search
  const [modalSearch, setModalSearch] = useState('');

  // Form draft & editing state
  const [editingSeriesId, setEditingSeriesId] = useState<number | null>(null);
  const [draft, setDraft] = useState<FormDraft>(initialFormDraft);
  const [newAltTitle, setNewAltTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newPublisher, setNewPublisher] = useState('');
  const [newTag, setNewTag] = useState('');

  // Import states
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState<{ title: string; href: string } | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtered titles for Main List (Image 1)
  const filteredTitles = useMemo(() => {
    return catalogItems.filter((item) => {
      if (typeFilter !== 'All types') {
        if ((item.category || '').toLowerCase() !== typeFilter.toLowerCase()) return false;
      }
      if (statusFilter !== 'All statuses') {
        const itemStatus = (item.status || '').toLowerCase();
        const filterNorm = statusFilter.toLowerCase();
        if (filterNorm === 'releasing' && itemStatus !== 'releasing' && itemStatus !== 'ongoing') return false;
        if (filterNorm !== 'releasing' && itemStatus !== filterNorm) return false;
      }
      if (listSearch.trim()) {
        const term = listSearch.trim().toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(term);
        const matchSlug = item.slug.toLowerCase().includes(term);
        const matchAlt = item.alternateTitles?.some((alt) => alt.toLowerCase().includes(term));
        if (!matchTitle && !matchSlug && !matchAlt) return false;
      }
      return true;
    });
  }, [catalogItems, listSearch, typeFilter, statusFilter]);

  // Modal search matching
  const modalMatches = useMemo(() => {
    if (!modalSearch.trim()) return [];
    const term = modalSearch.trim().toLowerCase();
    return catalogItems
      .filter((item) => item.title.toLowerCase().includes(term) || item.slug.toLowerCase().includes(term))
      .slice(0, 6);
  }, [catalogItems, modalSearch]);

  // Create series mutation
  const createSeriesMutation = useMutation({
    mutationFn: createSeriesRecord,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SERIES_CATALOG_QUERY_KEY });
      setView('list');
      setEditingSeriesId(null);
      setDraft(initialFormDraft());
      setImportUrl('');
      setImportError(null);
      setDuplicateTitle(null);
      setImportSuccess(null);
      setSubmitError(null);
    },
    onError: (err: any) => {
      setSubmitError(err?.message || 'Failed to create series. Please check your data and try again.');
    },
  });

  // Update series mutation
  const updateSeriesMutation = useMutation({
    mutationFn: updateSeriesRecord,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SERIES_CATALOG_QUERY_KEY });
      setView('list');
      setEditingSeriesId(null);
      setDraft(initialFormDraft());
      setImportUrl('');
      setImportError(null);
      setDuplicateTitle(null);
      setImportSuccess(null);
      setSubmitError(null);
    },
    onError: (err: any) => {
      setSubmitError(err?.message || 'Failed to update series. Please check your data and try again.');
    },
  });

  // Delete series mutation
  const deleteSeriesMutation = useMutation({
    mutationFn: deleteSeriesRecord,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SERIES_CATALOG_QUERY_KEY });
    },
    onError: (err: any) => {
      alert(err?.message || 'Failed to delete series.');
    },
  });

  // Check if a title already exists in the catalog (excluding current editing series)
  const checkDuplicate = (titleToCheck: string, sourceId?: string): { title: string; href: string } | null => {
    const cleanTitle = titleToCheck.trim().toLowerCase();
    const cleanSlug = slugify(titleToCheck);

    const existing = catalogItems.find((item) => {
      if (editingSeriesId && item.id === editingSeriesId) return false;
      if (item.title.trim().toLowerCase() === cleanTitle) return true;
      if (item.slug === cleanSlug) return true;
      if (item.alternateTitles?.some((alt) => alt.trim().toLowerCase() === cleanTitle)) return true;
      if (sourceId && item.trackers?.some((t) => t.url?.includes(sourceId))) return true;
      return false;
    });

    if (existing) {
      return {
        title: existing.title,
        href: existing.href || `/series/${existing.slug}`,
      };
    }
    return null;
  };

  // Import handler for MangaDex (Images 4 & 5)
  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setIsImporting(true);
    setImportError(null);
    setDuplicateTitle(null);
    setImportSuccess(null);

    try {
      const data = await fetchMangaDexDetails(importUrl);

      const duplicate = checkDuplicate(data.title, data.id);
      if (duplicate) {
        setDuplicateTitle(duplicate);
        return;
      }

      // Populate draft
      setDraft((current) => ({
        ...current,
        title: data.title || current.title,
        alternateTitles: data.alternateTitles.length ? data.alternateTitles : current.alternateTitles,
        synopsis: data.description || current.synopsis,
        authors: data.authors.length ? data.authors : current.authors,
        artists: data.artists.length ? data.artists : current.artists,
        category: data.type || current.category,
        contentRating: data.contentRating || current.contentRating,
        status: data.status || current.status,
        year: data.year || current.year,
        originalLanguage: data.originalLanguage || current.originalLanguage,
        demographics: data.demographics.length ? data.demographics : current.demographics,
        genres: data.genres.length ? Array.from(new Set([...current.genres, ...data.genres])) : current.genres,
        formats: data.formats.length ? Array.from(new Set([...current.formats, ...data.formats])) : current.formats,
        tags: data.tags.length ? Array.from(new Set([...current.tags, ...data.tags])) : current.tags,
        cover: data.coverUrl || current.cover,
        trackers: data.trackerUrl && !current.trackers.some((t) => t.url.includes(data.id))
          ? [...current.trackers, { name: 'MangaDex', url: data.trackerUrl, logo: '', isSample: false }]
          : current.trackers,
      }));

      setImportSuccess(`Imported "${data.title}" successfully.`);
    } catch (err: any) {
      // Image 5: Display exact error banner e.g. "Unable to read api: <id>"
      // Do not clear or override any existing local form fields!
      setImportError(err?.message || 'Unable to read api');
    } finally {
      setIsImporting(false);
    }
  };

  // Cover file upload handler
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPG, PNG, or WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setDraft((curr) => ({ ...curr, cover: dataUrl }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Tag & array helpers
  const toggleArrayItem = (key: 'demographics' | 'genres' | 'formats', item: string) => {
    setDraft((curr) => {
      const list = curr[key];
      const next = list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
      return { ...curr, [key]: next };
    });
  };

  const addAltTitle = () => {
    const val = newAltTitle.trim();
    if (val && !draft.alternateTitles.includes(val)) {
      setDraft((curr) => ({ ...curr, alternateTitles: [...curr.alternateTitles, val] }));
      setNewAltTitle('');
    }
  };

  const removeAltTitle = (index: number) => {
    setDraft((curr) => ({
      ...curr,
      alternateTitles: curr.alternateTitles.filter((_, i) => i !== index),
    }));
  };

  const addAuthor = () => {
    const val = newAuthor.trim();
    if (val && !draft.authors.includes(val)) {
      setDraft((curr) => ({ ...curr, authors: [...curr.authors, val] }));
      setNewAuthor('');
    }
  };

  const addArtist = () => {
    const val = newArtist.trim();
    if (val && !draft.artists.includes(val)) {
      setDraft((curr) => ({ ...curr, artists: [...curr.artists, val] }));
      setNewArtist('');
    }
  };

  const addPublisher = () => {
    const val = newPublisher.trim();
    if (val && !draft.publishers.includes(val)) {
      setDraft((curr) => ({ ...curr, publishers: [...curr.publishers, val] }));
      setNewPublisher('');
    }
  };

  const addTag = () => {
    const val = newTag.trim();
    if (val && !draft.tags.includes(val)) {
      setDraft((curr) => ({ ...curr, tags: [...curr.tags, val] }));
      setNewTag('');
    }
  };

  // Form submit
  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const title = draft.title.trim();
    if (!title) {
      setSubmitError('Title is required.');
      return;
    }

    if (duplicateTitle) {
      setSubmitError('This title already exists in your website catalog. Prevent duplicate.');
      return;
    }

    if (editingSeriesId) {
      const updatePayload: UpdateSeriesRequest = {
        id: editingSeriesId,
        title,
        cover: draft.cover.trim() || '',
        category: draft.category || 'Manga',
        status: draft.status || 'Releasing',
        synopsis: draft.synopsis.trim() || undefined,
        alternateTitles: draft.alternateTitles,
        author: draft.authors.join(', ') || undefined,
        artist: draft.artists.join(', ') || undefined,
        publishers: draft.publishers,
        contentRating: draft.contentRating || 'Safe',
        year: draft.year ? Number(draft.year) : undefined,
        originalLanguage: draft.originalLanguage || undefined,
        demographics: draft.demographics,
        genres: draft.genres,
        formats: draft.formats,
        tags: draft.tags,
        trackers: draft.trackers.filter((t) => t.name && t.url),
        sources: draft.sources.filter((s) => s.name && s.url),
      };
      updateSeriesMutation.mutate(updatePayload);
    } else {
      const payload: CreateSeriesRequest = {
        title,
        cover: draft.cover.trim() || undefined,
        category: draft.category || 'Manga',
        status: draft.status || 'Releasing',
        synopsis: draft.synopsis.trim() || undefined,
        alternateTitles: draft.alternateTitles.length ? draft.alternateTitles : undefined,
        author: draft.authors.join(', ') || undefined,
        artist: draft.artists.join(', ') || undefined,
        publishers: draft.publishers.length ? draft.publishers : undefined,
        contentRating: draft.contentRating || 'Safe',
        year: draft.year ? Number(draft.year) : undefined,
        originalLanguage: draft.originalLanguage || undefined,
        demographics: draft.demographics.length ? draft.demographics : undefined,
        genres: draft.genres.length ? draft.genres : undefined,
        formats: draft.formats.length ? draft.formats : undefined,
        tags: draft.tags.length ? draft.tags : undefined,
        trackers: draft.trackers.filter((t) => t.name && t.url),
        sources: draft.sources.filter((s) => s.name && s.url),
      };
      createSeriesMutation.mutate(payload);
    }
  };

  // ==========================================
  // RENDER: IMAGE 3, 4, 5 — NEW TITLE INTERFACE
  // ==========================================
  if (view === 'new-title') {
    return (
      <div className="uploads-theme-container">
        {/* Breadcrumb Header */}
        <div className="new-title-nav">
          <nav className="new-title-breadcrumb" aria-label="Breadcrumb">
            <button type="button" className="breadcrumb-link" onClick={() => { setView('list'); setEditingSeriesId(null); }}>
              HOME
            </button>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">{editingSeriesId ? 'EDIT TITLE' : 'NEW TITLE'}</span>
          </nav>
          <h1 className="new-title-heading">{editingSeriesId ? 'Edit title' : 'New title'}</h1>
          <p className="new-title-subheading">
            {editingSeriesId
              ? 'Update the details for this title. Required fields are marked with *.'
              : 'Add a new title to the catalog. Required fields are marked with *.'}
          </p>
        </div>

        <form onSubmit={handleCreateSubmit} className="new-title-form" noValidate>
          {/* Section 1: Import from source (Images 3, 4, 5) */}
          <section className="form-card-section">
            <h2 className="section-title">Import from source</h2>
            <p className="section-description">
              Paste a MangaDex link to auto-fill title, cover, and details. You can also upload your own cover.
            </p>

            <div className="import-row">
              <input
                type="text"
                className="import-input"
                placeholder="Paste MangaDex or MangaBaka link..."
                value={importUrl}
                onChange={(e) => {
                  setImportUrl(e.target.value);
                  setImportError(null);
                  setDuplicateTitle(null);
                  setImportSuccess(null);
                }}
              />
              <button
                type="button"
                className="btn-teal btn-import"
                onClick={handleImport}
                disabled={isImporting || !importUrl.trim()}
              >
                {isImporting ? <LoaderCircle className="spin-icon" size={16} /> : null}
                {isImporting ? 'Importing...' : 'Import'}
              </button>
            </div>

            {/* Image 4: Duplicate Alert Banner */}
            {duplicateTitle && (
              <div className="alert-banner alert-banner-warning" role="alert">
                <AlertTriangle className="alert-icon" size={17} />
                <span>
                  This title already exists:{' '}
                  <a href={duplicateTitle.href} target="_blank" rel="noreferrer" className="alert-link">
                    {duplicateTitle.title} <ArrowUpRight size={13} style={{ display: 'inline' }} />
                  </a>
                </span>
              </div>
            )}

            {/* Image 5: Invalid API Error Banner */}
            {importError && (
              <div className="alert-banner alert-banner-error" role="alert">
                <AlertCircle className="alert-icon" size={17} />
                <span>{importError}</span>
              </div>
            )}

            {/* Success feedback */}
            {importSuccess && (
              <div className="alert-banner alert-banner-success" role="status">
                <Check className="alert-icon" size={17} />
                <span>{importSuccess}</span>
              </div>
            )}
          </section>

          {/* Section 2: Basics */}
          <section className="form-card-section">
            <h2 className="section-title">Basics</h2>
            <p className="section-description">Cover, title, and synopsis.</p>

            <div className="field-group">
              <label className="field-label">Cover image</label>
              <div className="cover-upload-area">
                <div className="cover-preview-box">
                  {draft.cover ? (
                    <img src={draft.cover} alt="Cover preview" className="cover-img" />
                  ) : (
                    <span className="no-cover-label">No cover</span>
                  )}
                </div>

                <div className="cover-upload-controls">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".jpg,.jpeg,.png,.webp"
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="btn-dark btn-upload"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload
                  </button>
                  <p className="hint-text">JPG/PNG/WEBP, recommended 400×600.</p>
                  {draft.cover && (
                    <button
                      type="button"
                      className="btn-text-danger"
                      onClick={() => setDraft((c) => ({ ...c, cover: '' }))}
                    >
                      Remove cover
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">
                Title <span className="required-star">*</span>
              </label>
              <input
                type="text"
                className="text-input"
                placeholder="e.g. The Long Walk Home"
                value={draft.title}
                onChange={(e) => {
                  const val = e.target.value;
                  setDraft((c) => ({ ...c, title: val }));
                  const dup = checkDuplicate(val);
                  setDuplicateTitle(dup);
                }}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label">Alternative titles</label>
              <div className="alt-titles-list">
                {draft.alternateTitles.map((alt, idx) => (
                  <span key={idx} className="alt-title-chip">
                    {alt}
                    <button type="button" onClick={() => removeAltTitle(idx)}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="input-with-button-row">
                <input
                  type="text"
                  className="text-input"
                  placeholder="Add alternative title..."
                  value={newAltTitle}
                  onChange={(e) => setNewAltTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addAltTitle();
                    }
                  }}
                />
                <button type="button" className="btn-dark" onClick={addAltTitle}>
                  + Add alternative title
                </button>
              </div>
              <p className="hint-text">Other names this title is known by (romanizations, English title, etc.).</p>
            </div>

            <div className="field-group">
              <label className="field-label">Description</label>
              <textarea
                className="textarea-input"
                placeholder="A short synopsis of the story..."
                maxLength={5000}
                rows={5}
                value={draft.synopsis}
                onChange={(e) => setDraft((c) => ({ ...c, synopsis: e.target.value }))}
              />
              <div className="char-counter">{draft.synopsis.length} / 5000</div>
            </div>
          </section>

          {/* Section 3: Credits */}
          <section className="form-card-section">
            <h2 className="section-title">Credits</h2>
            <p className="section-description">Who made this title? Press Enter to add multiple.</p>

            <div className="field-group">
              <label className="field-label">Authors</label>
              <div className="alt-titles-list">
                {draft.authors.map((author, i) => (
                  <span key={i} className="alt-title-chip">
                    {author}
                    <button type="button" onClick={() => setDraft((c) => ({ ...c, authors: c.authors.filter((_, idx) => idx !== i) }))}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                className="text-input"
                placeholder="Add author..."
                value={newAuthor}
                onChange={(e) => setNewAuthor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAuthor();
                  }
                }}
              />
            </div>

            <div className="field-group">
              <label className="field-label">Artists</label>
              <div className="alt-titles-list">
                {draft.artists.map((artist, i) => (
                  <span key={i} className="alt-title-chip">
                    {artist}
                    <button type="button" onClick={() => setDraft((c) => ({ ...c, artists: c.artists.filter((_, idx) => idx !== i) }))}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                className="text-input"
                placeholder="Add artist..."
                value={newArtist}
                onChange={(e) => setNewArtist(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addArtist();
                  }
                }}
              />
            </div>

            <div className="field-group">
              <label className="field-label">Publishers</label>
              <div className="alt-titles-list">
                {draft.publishers.map((pub, i) => (
                  <span key={i} className="alt-title-chip">
                    {pub}
                    <button type="button" onClick={() => setDraft((c) => ({ ...c, publishers: c.publishers.filter((_, idx) => idx !== i) }))}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                className="text-input"
                placeholder="Add publisher..."
                value={newPublisher}
                onChange={(e) => setNewPublisher(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPublisher();
                  }
                }}
              />
            </div>
          </section>

          {/* Section 4: Classification */}
          <section className="form-card-section">
            <h2 className="section-title">Classification</h2>
            <p className="section-description">Format, status, and target readership.</p>

            <div className="grid-2col">
              <div className="field-group">
                <label className="field-label">
                  Type <span className="required-star">*</span>
                </label>
                <div className="select-wrapper">
                  <select
                    className="select-input"
                    value={draft.category}
                    onChange={(e) => setDraft((c) => ({ ...c, category: e.target.value }))}
                  >
                    {ALL_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <ChevronDown className="select-arrow" size={15} />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">
                  Content rating <span className="required-star">*</span>
                </label>
                <div className="select-wrapper">
                  <select
                    className="select-input"
                    value={draft.contentRating}
                    onChange={(e) => setDraft((c) => ({ ...c, contentRating: e.target.value }))}
                  >
                    {ALL_RATINGS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <ChevronDown className="select-arrow" size={15} />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">
                  Status <span className="required-star">*</span>
                </label>
                <div className="select-wrapper">
                  <select
                    className="select-input"
                    value={draft.status}
                    onChange={(e) => setDraft((c) => ({ ...c, status: e.target.value }))}
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <ChevronDown className="select-arrow" size={15} />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">Year</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="e.g. 2024"
                  value={draft.year}
                  onChange={(e) => setDraft((c) => ({ ...c, year: e.target.value }))}
                />
              </div>

              <div className="field-group grid-full-span">
                <label className="field-label">Original language</label>
                <div className="select-wrapper">
                  <select
                    className="select-input"
                    value={draft.originalLanguage}
                    onChange={(e) => setDraft((c) => ({ ...c, originalLanguage: e.target.value }))}
                  >
                    {ALL_LANGUAGES.map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <ChevronDown className="select-arrow" size={15} />
                </div>
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Demographic</label>
              <div className="pill-group">
                {ALL_DEMOGRAPHICS.map((dem) => {
                  const isSelected = draft.demographics.includes(dem);
                  return (
                    <button
                      type="button"
                      key={dem}
                      className={`toggle-pill ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => toggleArrayItem('demographics', dem)}
                    >
                      {dem}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Section 5: Categorization */}
          <section className="form-card-section">
            <h2 className="section-title">Categorization</h2>
            <p className="section-description">Pick genres, formats, and add free-form tags.</p>

            <div className="field-group">
              <label className="field-label">Genres</label>
              <div className="pill-group">
                {ALL_GENRES.map((genre) => {
                  const isSelected = draft.genres.includes(genre);
                  return (
                    <button
                      type="button"
                      key={genre}
                      className={`toggle-pill ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => toggleArrayItem('genres', genre)}
                    >
                      {genre}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Formats</label>
              <div className="pill-group">
                {ALL_FORMATS.map((fmt) => {
                  const isSelected = draft.formats.includes(fmt);
                  return (
                    <button
                      type="button"
                      key={fmt}
                      className={`toggle-pill ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => toggleArrayItem('formats', fmt)}
                    >
                      {fmt}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Tags</label>
              <div className="alt-titles-list">
                {draft.tags.map((tag, i) => (
                  <span key={i} className="alt-title-chip">
                    {tag}
                    <button type="button" onClick={() => setDraft((c) => ({ ...c, tags: c.tags.filter((_, idx) => idx !== i) }))}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                className="text-input"
                placeholder="Add a tag — e.g. Time Travel, Reincarnation..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <p className="hint-text">Tags help users discover this title: Use specific deep lore.</p>
            </div>
          </section>

          {/* Section 6: Trackers */}
          <section className="form-card-section">
            <h2 className="section-title">Trackers</h2>
            <p className="section-description">Link this title to external tracker entries.</p>
            {draft.trackers.map((tracker, idx) => (
              <div key={idx} className="link-edit-row">
                <input
                  type="text"
                  className="text-input"
                  placeholder="Tracker name (e.g. MangaDex)"
                  value={tracker.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDraft((c) => ({
                      ...c,
                      trackers: c.trackers.map((t, i) => (i === idx ? { ...t, name: val } : t)),
                    }));
                  }}
                />
                <input
                  type="url"
                  className="text-input"
                  placeholder="https://..."
                  value={tracker.url}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDraft((c) => ({
                      ...c,
                      trackers: c.trackers.map((t, i) => (i === idx ? { ...t, url: val } : t)),
                    }));
                  }}
                />
                <button
                  type="button"
                  className="btn-icon-danger"
                  onClick={() => setDraft((c) => ({ ...c, trackers: c.trackers.filter((_, i) => i !== idx) }))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-dark"
              onClick={() => setDraft((c) => ({ ...c, trackers: [...c.trackers, { name: '', url: '', logo: '', isSample: false }] }))}
            >
              + Add tracker
            </button>
          </section>

          {/* Section 7: Sources */}
          <section className="form-card-section">
            <h2 className="section-title">Sources</h2>
            <p className="section-description">Original/official source sites (raw publisher page, etc.)</p>
            {draft.sources.map((source, idx) => (
              <div key={idx} className="link-edit-row">
                <input
                  type="text"
                  className="text-input"
                  placeholder="Source name"
                  value={source.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDraft((c) => ({
                      ...c,
                      sources: c.sources.map((s, i) => (i === idx ? { ...s, name: val } : s)),
                    }));
                  }}
                />
                <input
                  type="url"
                  className="text-input"
                  placeholder="https://..."
                  value={source.url}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDraft((c) => ({
                      ...c,
                      sources: c.sources.map((s, i) => (i === idx ? { ...s, url: val } : s)),
                    }));
                  }}
                />
                <button
                  type="button"
                  className="btn-icon-danger"
                  onClick={() => setDraft((c) => ({ ...c, sources: c.sources.filter((_, i) => i !== idx) }))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-dark"
              onClick={() => setDraft((c) => ({ ...c, sources: [...c.sources, { name: '', url: '', logo: '', isSample: false }] }))}
            >
              + Add source
            </button>
          </section>

          {submitError && (
            <div className="alert-banner alert-banner-error" role="alert">
              <AlertCircle size={16} />
              <span>{submitError}</span>
            </div>
          )}

          {/* Footer actions */}
          <div className="form-actions-footer">
            <button type="button" className="btn-cancel" onClick={() => { setView('list'); setEditingSeriesId(null); }}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-teal btn-create"
              disabled={
                (editingSeriesId ? updateSeriesMutation.isPending : createSeriesMutation.isPending) ||
                !draft.title.trim() ||
                !!duplicateTitle
              }
            >
              {(editingSeriesId ? updateSeriesMutation.isPending : createSeriesMutation.isPending) ? (
                <LoaderCircle className="spin-icon" size={16} />
              ) : null}
              {editingSeriesId
                ? (updateSeriesMutation.isPending ? 'Saving...' : 'Save changes')
                : (createSeriesMutation.isPending ? 'Creating...' : 'Create title')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ==========================================
  // RENDER: IMAGE 1 & 2 — MAIN UPLOADS VIEW
  // ==========================================
  return (
    <div className="uploads-theme-container">
      {/* Top Header Row (Image 1) */}
      <div className="uploads-header-row">
        <div>
          <h1 className="uploads-main-heading">Uploads</h1>
          <p className="uploads-main-subheading">Manage the titles and chapters you've uploaded.</p>
        </div>
        <button
          type="button"
          className="btn-teal btn-upload-header"
          onClick={() => {
            setIsModalOpen(true);
            setModalSearch('');
          }}
        >
          <Upload size={16} />
          Upload
        </button>
      </div>

      {/* Navigation Sub-tabs */}
      <div className="uploads-nav-tabs">
        <button
          type="button"
          className={`uploads-tab ${mainTab === 'titles' ? 'is-active' : ''}`}
          onClick={() => setMainTab('titles')}
        >
          Titles
        </button>
        <button
          type="button"
          className={`uploads-tab ${mainTab === 'chapters' ? 'is-active' : ''}`}
          onClick={() => setMainTab('chapters')}
        >
          Chapters
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="uploads-filter-bar">
        <div className="search-input-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search titles you uploaded..."
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
          />
          {listSearch && (
            <button type="button" className="search-clear" onClick={() => setListSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="filter-dropdown-wrap">
          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option>All types</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <ChevronDown className="select-arrow" size={14} />
        </div>

        <div className="filter-dropdown-wrap">
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option>All statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <ChevronDown className="select-arrow" size={14} />
        </div>
      </div>

      {/* Main Content Area: Empty State or Grid */}
      {mainTab === 'titles' ? (
        filteredTitles.length === 0 ? (
          <div className="uploads-empty-state">
            <div className="empty-icon-outline">
              <FileText size={32} strokeWidth={1.5} />
            </div>
            <h3 className="empty-title">No titles.</h3>
            <p className="empty-subtitle">Upload a chapter to any manga page to start.</p>
          </div>
        ) : (
          <div className="uploads-titles-grid">
            {filteredTitles.map((series) => (
              <div key={series.id} className="title-item-card">
                <div className="title-cover">
                  {series.cover ? (
                    <img src={series.cover} alt={series.title} loading="lazy" />
                  ) : (
                    <BookOpen size={24} className="cover-fallback-icon" />
                  )}
                </div>
                <div className="title-info">
                  <h4 className="title-name">{series.title}</h4>
                  <div className="title-badges">
                    <span className="badge-tag">{series.category || 'Manga'}</span>
                    <span className="badge-tag status-badge">{series.status || 'Ongoing'}</span>
                  </div>
                  <div className="title-stats">
                    <span>{series.chapters?.length || 0} chapters</span>
                  </div>
                </div>
                <div className="title-actions">
                  <button
                    type="button"
                    className="title-action-btn"
                    title="Edit series details"
                    onClick={() => {
                      setEditingSeriesId(series.id);
                      setDraft({
                        title: series.title || '',
                        cover: series.cover || '',
                        category: series.category || 'Manga',
                        status: series.status || 'Ongoing',
                        synopsis: series.synopsis || '',
                        alternateTitles: series.alternateTitles || [],
                        authors: series.author ? series.author.split(',').map((s) => s.trim()) : [],
                        artists: series.artist ? series.artist.split(',').map((s) => s.trim()) : [],
                        publishers: series.publishers || [],
                        contentRating: series.contentRating || 'Safe',
                        year: series.year ? String(series.year) : '',
                        originalLanguage: series.originalLanguage || 'Japanese',
                        demographics: series.demographics || [],
                        genres: series.genres || [],
                        formats: series.formats || [],
                        tags: series.tags || [],
                        trackers: series.trackers ? series.trackers.map((t) => ({ ...t, logo: t.logo || '', isSample: !!t.isSample })) : [],
                        sources: series.sources ? series.sources.map((s) => ({ ...s, logo: s.logo || '', isSample: !!s.isSample })) : [],
                      });
                      setImportUrl('');
                      setImportError(null);
                      setDuplicateTitle(null);
                      setImportSuccess(null);
                      setSubmitError(null);
                      setView('new-title');
                    }}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    type="button"
                    className="title-action-btn title-action-btn-danger"
                    title="Delete series"
                    disabled={deleteSeriesMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to delete "${series.title}"? This cannot be undone.`)) {
                        deleteSeriesMutation.mutate(series.id);
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                  <a
                    href={series.href || `/series/${series.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="title-action-btn"
                    title="View public page"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Chapters Tab */
        <div className="uploads-empty-state">
          <div className="empty-icon-outline">
            <FileText size={32} strokeWidth={1.5} />
          </div>
          <h3 className="empty-title">No chapters.</h3>
          <p className="empty-subtitle">Upload a chapter to any manga page to start.</p>
        </div>
      )}

      {/* ========================================== */}
      {/* IMAGE 2: UPLOAD CHAPTER MODAL DIALOG       */}
      {/* ========================================== */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Upload chapter</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <p className="modal-subtitle">Pick a title to add a chapter to, or create a new title.</p>

            <div className="modal-search-field">
              <Search size={16} className="modal-search-icon" />
              <input
                type="text"
                placeholder="Search a title..."
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                autoFocus
              />
            </div>
            <p className="modal-search-hint">Start typing a title to find it.</p>

            {/* If matching titles found */}
            {modalMatches.length > 0 && (
              <div className="modal-results-list">
                {modalMatches.map((item) => (
                  <div
                    key={item.id}
                    className="modal-result-item"
                    onClick={() => {
                      alert(`Selected title: ${item.title}. Chapter upload flow can be integrated here.`);
                    }}
                  >
                    <div className="result-thumb">
                      {item.cover ? <img src={item.cover} alt="" /> : <BookOpen size={16} />}
                    </div>
                    <div className="result-info">
                      <strong>{item.title}</strong>
                      <small>{item.chapters?.length || 0} chapters • {item.category}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-buttons-group">
              <button
                type="button"
                className="btn-teal btn-create-new-title"
                onClick={() => {
                  setIsModalOpen(false);
                  setView('new-title');
                  setDraft(initialFormDraft());
                  setImportUrl('');
                  setImportError(null);
                  setDuplicateTitle(null);
                  setImportSuccess(null);
                }}
              >
                <Plus size={16} />
                Create new title
              </button>

              <button
                type="button"
                className="btn-dark btn-uploaded-chapters"
                onClick={() => {
                  setIsModalOpen(false);
                  setMainTab('chapters');
                }}
              >
                <List size={16} />
                Uploaded Chapters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
