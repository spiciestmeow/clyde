import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Edit2,
  ExternalLink,
  FileText,
  GripVertical,
  Image as ImageIcon,
  List,
  LoaderCircle,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { syncSeriesSources, syncDirectSources, type SyncSourcesResult, type DirectSourceResult } from '../lib/syncSources';
import {
  createSeriesRecord,
  updateSeriesRecord,
  deleteSeriesRecord,
  addSeriesChapter,
  SERIES_CATALOG_QUERY_KEY,
  type CreateSeriesRequest,
  type UpdateSeriesRequest,
  type SeriesLink,
  type SeriesRecord,
} from '../lib/seriesCatalog';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import { fetchMangaDexDetails } from '../lib/mangadex';
import { uploadOrCompressCover } from '../lib/imageUpload';
import './series-catalog-manager.css';
import { BackgroundSyncTimer } from './BackgroundSyncTimer';
import { SyncActivityLogs } from './SyncActivityLogs';
import { ConfirmationDialog } from './ConfirmationDialog';

type LinkDraft = {
  name: string;
  url: string;
  logo: string;
  isSample: boolean;
  latestChapterNumber?: string;
  latestChapterAt?: string;
  rating?: string;
};

type FormDraft = {
  title: string;
  cover: string;
  category: string;
  status: string;
  isNew: boolean;
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
  chapters?: SeriesRecord['chapters'];
  facts?: Record<string, string | null>;
  rating?: string;
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

function formatDetectedSourceAge(timestamp?: string): string {
  if (!timestamp) return 'time unavailable';
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return 'time unavailable';

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - parsed) / 60_000));
  if (elapsedMinutes < 1) return 'just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes} min${elapsedMinutes === 1 ? '' : 's'} ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr${elapsedHours === 1 ? '' : 's'} ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays === 1) return '1 day ago';
  return `${elapsedDays} days ago`;
}
const ALL_LANGUAGES = ['Japanese', 'Korean', 'Chinese', 'English', 'Other'];

const initialFormDraft = (): FormDraft => ({
  title: '',
  cover: '',
  category: 'Manga',
  status: 'Releasing',
  isNew: true,
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
  chapters: [],
  facts: {},
  rating: '',
});

const TITLE_EDITOR_SESSION_KEY = 'comix-admin-title-editor-v1';

function loadTitleEditorSession(): { draft: FormDraft; editingSeriesId: number | null } | null {
  try {
    const saved = sessionStorage.getItem(TITLE_EDITOR_SESSION_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved) as { draft?: FormDraft; editingSeriesId?: number | null };
    if (!parsed.draft || typeof parsed.draft !== 'object') return null;

    return {
      draft: { ...initialFormDraft(), ...parsed.draft },
      editingSeriesId: typeof parsed.editingSeriesId === 'number' ? parsed.editingSeriesId : null,
    };
  } catch {
    return null;
  }
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface CreditsAutocompleteFieldProps {
  label: string;
  items: string[];
  onRemoveItem: (index: number) => void;
  onAddItem: (value: string) => void;
  placeholder: string;
  existingSuggestions: string[];
  buttonText: string;
  inputValue: string;
  onInputChange: (value: string) => void;
}

function CreditsAutocompleteField({
  label,
  items,
  onRemoveItem,
  onAddItem,
  placeholder,
  existingSuggestions,
  buttonText,
  inputValue,
  onInputChange,
}: CreditsAutocompleteFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const cleanQuery = inputValue.trim().toLowerCase();

  const filteredSuggestions = useMemo(() => {
    if (!cleanQuery) return [];
    return existingSuggestions
      .filter((name) => name.toLowerCase().includes(cleanQuery) && !items.includes(name))
      .slice(0, 30);
  }, [cleanQuery, existingSuggestions, items]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (val: string) => {
    const trimmed = val.trim();
    if (trimmed) {
      onAddItem(trimmed);
      onInputChange('');
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (filteredSuggestions.length > 0) {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex((prev) => (prev + 1) % filteredSuggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      if (filteredSuggestions.length > 0) {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex((prev) => (prev <= 0 ? filteredSuggestions.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && filteredSuggestions[highlightedIndex]) {
        handleSelect(filteredSuggestions[highlightedIndex]);
      } else if (inputValue.trim()) {
        handleSelect(inputValue);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const optionElements = listRef.current.querySelectorAll('.credits-autocomplete-item');
      const target = optionElements[highlightedIndex] as HTMLElement | undefined;
      if (target) {
        target.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  return (
    <div className="field-group credits-autocomplete-group" ref={containerRef}>
      <label className="field-label">{label}</label>
      {items.length > 0 && (
        <div className="alt-titles-list">
          {items.map((item, i) => (
            <span key={i} className="alt-title-chip">
              {item}
              <button
                type="button"
                onClick={() => onRemoveItem(i)}
                aria-label={`Remove ${item}`}
                title={`Remove ${item}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="input-with-button-row credits-input-row credits-input-autocomplete-wrap">
        <input
          type="text"
          className="text-input"
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => {
            onInputChange(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => {
            if (inputValue.trim()) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        <button
          type="button"
          className="credits-add-button"
          onClick={() => handleSelect(inputValue)}
          disabled={!inputValue.trim()}
          aria-label={buttonText}
          title={buttonText}
        >
          <Plus size={18} />
          <span>{buttonText}</span>
        </button>

        {isOpen && filteredSuggestions.length > 0 && (
          <div className="credits-autocomplete-dropdown" ref={listRef} role="listbox">
            {filteredSuggestions.map((suggestion, idx) => {
              const isSelected = idx === highlightedIndex;
              return (
                <button
                  key={suggestion}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`credits-autocomplete-item${isSelected ? ' is-highlighted' : ''}`}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(suggestion);
                  }}
                >
                  {suggestion}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceNameAutocomplete({
  value,
  suggestions,
  onChange,
}: {
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const query = value.trim().toLocaleLowerCase();
  const options = useMemo(
    () => suggestions.filter((name) => !query || name.toLocaleLowerCase().includes(query)).slice(0, 30),
    [query, suggestions],
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (isOpen && highlightedIndex >= 0) {
      const items = listRef.current?.querySelectorAll('.credits-autocomplete-item');
      (items?.[highlightedIndex] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const choose = (name: string) => {
    onChange(name);
    setIsOpen(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((index) => (index <= 0 ? options.length - 1 : index - 1));
    } else if (event.key === 'Enter' && isOpen && options[highlightedIndex]) {
      event.preventDefault();
      choose(options[highlightedIndex]);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="source-name-autocomplete-wrap" ref={containerRef}>
      <input
        type="text"
        className="text-input"
        placeholder="Source name"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
          setHighlightedIndex(0);
        }}
        onFocus={() => {
          setIsOpen(true);
          setHighlightedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen && options.length > 0}
        aria-autocomplete="list"
      />
      {isOpen && options.length > 0 && (
        <div className="credits-autocomplete-dropdown source-name-autocomplete-dropdown" ref={listRef} role="listbox">
          {options.map((name, index) => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={index === highlightedIndex}
              className={`credits-autocomplete-item${index === highlightedIndex ? ' is-highlighted' : ''}`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(name);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SeriesCatalogManager({
  globalSearch = '',
  newSeriesOrder = [],
  customSourceNames = [],
  onSaveNewSeriesOrder,
  isSavingNewSeriesOrder = false,
  newSeriesOrderSaveMessage = 'Saved',
}: {
  globalSearch?: string;
  newSeriesOrder?: string[];
  customSourceNames?: string[];
  onSaveNewSeriesOrder?: (order: string[]) => Promise<void>;
  isSavingNewSeriesOrder?: boolean;
  newSeriesOrderSaveMessage?: string;
}) {
  const queryClient = useQueryClient();
  const catalogQuery = useSeriesCatalog();
  const catalogItems = catalogQuery.items;
  const [savedTitleEditor] = useState(loadTitleEditorSession);

  // View state: 'list' (Image 1) or 'new-title' (Image 3)
  const [view, setView] = useState<'list' | 'new-title'>(() => savedTitleEditor ? 'new-title' : 'list');
  // Modal state: Image 2 "Upload chapter" dialog
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Main tabs: 'titles' or 'chapters'
  const [mainTab, setMainTab] = useState<'titles' | 'chapters' | 'new-order'>('titles');
  const [draggedNewSeriesId, setDraggedNewSeriesId] = useState<number | null>(null);
  const [dragOverNewSeriesId, setDragOverNewSeriesId] = useState<number | null>(null);

  // List filters
  const [listSearch, setListSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Modal search
  const [modalSearch, setModalSearch] = useState('');

  // Form draft & editing state
  const [editingSeriesId, setEditingSeriesId] = useState<number | null>(() => savedTitleEditor?.editingSeriesId ?? null);
  const [draft, setDraft] = useState<FormDraft>(() => savedTitleEditor?.draft ?? initialFormDraft());
  const [pendingSourceRemovalIndex, setPendingSourceRemovalIndex] = useState<number | null>(null);
  const [seriesPendingDelete, setSeriesPendingDelete] = useState<SeriesRecord | null>(null);
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

  useEffect(() => {
    if (view !== 'new-title') {
      sessionStorage.removeItem(TITLE_EDITOR_SESSION_KEY);
      return;
    }

    const session = JSON.stringify({ draft, editingSeriesId });
    try {
      sessionStorage.setItem(TITLE_EDITOR_SESSION_KEY, session);
    } catch {
      // Keep the editor state in memory if the browser storage quota is exhausted.
    }
  }, [view, draft, editingSeriesId]);

  // Chapter upload states
  const [selectedSeriesForChapter, setSelectedSeriesForChapter] = useState<SeriesRecord | null>(null);
  const [chapterTitleInput, setChapterTitleInput] = useState('');
  const [chapterStatusInput, setChapterStatusInput] = useState('New');
  const [chapterError, setChapterError] = useState<string | null>(null);

  // Sync sources modal state
  const [isSyncSourcesOpen, setIsSyncSourcesOpen] = useState(false);
  const [syncQuery, setSyncQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncSourcesResult | null>(null);
  const [selectedSourceIndices, setSelectedSourceIndices] = useState<Set<number>>(new Set());
  const [syncFilter, setSyncFilter] = useState<'all' | 'scanlator' | 'official'>('all');

  const openSyncSourcesModal = (initialSearch?: string) => {
    const q = initialSearch || draft.title || '';
    setSyncQuery(q);
    setSyncError(null);
    setSyncResult(null);
    setSelectedSourceIndices(new Set());
    setSyncFilter('all');
    setIsSyncSourcesOpen(true);
    if (q.trim()) {
      void runSyncSources(q);
    }
  };

  const runSyncSources = async (queryToSearch: string) => {
    const q = queryToSearch.trim();
    if (!q) {
      setSyncError('Please enter a series title to search.');
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      const result = await syncSeriesSources(q, draft.alternateTitles.map((title) => title.trim()).filter(Boolean));
      setSyncResult(result);
      if (!result.matchedSeries || result.sources.length === 0) {
        setSyncError(`No scanlation sources found for "${q}". Try another alias or spelling.`);
        setSelectedSourceIndices(new Set());
      } else {
        const activeIdxs = new Set<number>();
        result.sources.forEach((s, i) => {
          if (s.active) activeIdxs.add(i);
        });
        setSelectedSourceIndices(activeIdxs);
      }
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : 'Failed to search sources.');
      setSyncResult(null);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportSelectedSources = () => {
    if (!syncResult || selectedSourceIndices.size === 0) return;

    const sourcesToAdd = syncResult.sources
      .filter((_, idx) => selectedSourceIndices.has(idx))
      .map((s) => ({
        name: s.name,
        url: s.url,
        logo: s.logo || '',
        isSample: false,
      }));

    setDraft((prev) => {
      const existingNames = new Set(prev.sources.map((s) => s.name.trim().toLowerCase()));
      const existingUrls = new Set(prev.sources.map((s) => s.url.trim().toLowerCase()).filter(Boolean));

      const newFiltered = sourcesToAdd.filter((item) => {
        const lowerName = item.name.trim().toLowerCase();
        const lowerUrl = item.url.trim().toLowerCase();
        if (existingNames.has(lowerName)) return false;
        if (lowerUrl && existingUrls.has(lowerUrl)) return false;
        return true;
      });

      // If synced series has a highest chapter, add or update a chapter entry if needed
      const highestCh = syncResult.matchedSeries?.latestChapterNumber;
      const releaseTimestamp = syncResult.matchedSeries?.lastReleaseTimestamp;
      const existingChapters = prev.chapters ? [...prev.chapters] : [];
      let updatedChapters = existingChapters;

      if (highestCh) {
        const chapterNumStr = highestCh.replace(/^ch(?:apter)?\.?\s*/i, '').trim();
        const chapterTitle = `Chapter ${chapterNumStr}`;
        const hasChapter = existingChapters.some((c) =>
          c.title.toLowerCase().includes(`chapter ${chapterNumStr.toLowerCase()}`) ||
          c.title.trim() === chapterTitle
        );

        if (!hasChapter) {
          const seriesSlug = slugify(prev.title || syncResult.matchedSeries?.title || 'series');
          const chSlug = slugify(chapterTitle);
          const newCh = {
            title: chapterTitle,
            href: `/series/${seriesSlug}/${chSlug}`,
            status: 'New',
            locked: false,
          };
          updatedChapters = [newCh, ...existingChapters];
        }
      }

      // Record release timestamp and latest chapter in facts
      const updatedFacts = {
        ...(prev.facts || {}),
        ...(releaseTimestamp ? { last_chapter_added_at: new Date(releaseTimestamp).toISOString() } : {}),
        ...(highestCh ? { latest_chapter_number: highestCh } : {}),
      };

      return {
        ...prev,
        sources: [...prev.sources, ...newFiltered],
        chapters: updatedChapters,
        facts: updatedFacts,
      };
    });

    setIsSyncSourcesOpen(false);
  };

  const [isSyncingDirect, setIsSyncingDirect] = useState(false);
  const [directSyncFeedback, setDirectSyncFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    sourceResults?: DirectSourceResult['sourceResults'];
    sourceIssues?: DirectSourceResult['sourceIssues'];
  } | null>(null);

  const handleManualSyncDirectSources = async () => {
    const validSources = draft.sources.filter((s) => s.url?.trim());
    if (validSources.length === 0) {
      setDirectSyncFeedback({
        type: 'error',
        message: 'Please add at least one source URL with a direct series link first.',
      });
      return;
    }

    setIsSyncingDirect(true);
    setDirectSyncFeedback(null);

    try {
      const result = await syncDirectSources(validSources, draft.title);
      if (!result.success || !result.highestChapter) {
        setDirectSyncFeedback({
          type: 'error',
          message: result.message || 'Could not detect any chapters from the added source URLs.',
          sourceIssues: result.sourceIssues,
        });
        return;
      }

      setDraft((prev) => {
        const uploadTimeIso = result.latestReleaseAt;
        const sourceResultsByUrl = new Map(result.sourceResults.map((source) => [source.url.trim(), source]));
        const nextSources = prev.sources.map((source) => {
          const scanResult = sourceResultsByUrl.get(source.url.trim());
          if (!scanResult) return source;
          return {
            ...source,
            latestChapterNumber: scanResult.latestChapterNumber,
            // Replace stale release dates as well as chapter counts. An
            // unavailable date should stay unknown, not retain a prior sync time.
            latestChapterAt: scanResult.latestChapterAt,
            rating: scanResult.rating || source.rating,
          };
        });
        const nextFacts = {
          ...(prev.facts || {}),
          latest_chapter_number: String(result.highestChapter),
          ...(uploadTimeIso ? {
            last_chapter_added_at: uploadTimeIso,
            lastUpdate: uploadTimeIso,
          } : {}),
          ...(result.sourceUrl ? {
            latest_source_name: result.sourceName,
            latest_source_url: result.sourceUrl,
          } : {}),
          ...(result.latestReleaseName ? { last_source: result.latestReleaseName } : {}),
        };

        const existingChapters = prev.chapters ? [...prev.chapters] : [];
        let updatedChapters = existingChapters;

        if (result.detectedChapters.length > 0) {
          const seriesSlug = slugify(prev.title || 'series');
          const generatedFromDetected = result.detectedChapters.map((ch) => ({
            title: ch.title,
            href: `/series/${seriesSlug}/chapter-${ch.number}`,
            status: ch.number === parseFloat(result.highestChapter) ? 'New' : '',
            locked: false,
            ...(ch.releasedAt ? { createdAt: ch.releasedAt } : {}),
            sourceName: ch.sourceName,
          }));

          if (existingChapters.length <= 1) {
            updatedChapters = generatedFromDetected;
          } else {
            const topTitle = `Chapter ${result.highestChapter}`;
            const hasTop = existingChapters.some(
              (c) => c.title.toLowerCase() === topTitle.toLowerCase() || c.title.includes(result.highestChapter)
            );
            if (!hasTop) {
              updatedChapters = [
                {
                  title: topTitle,
                  href: `/series/${seriesSlug}/chapter-${result.highestChapter}`,
                  status: 'New',
                  locked: false,
                  ...(uploadTimeIso ? { createdAt: uploadTimeIso } : {}),
                  sourceName: result.latestReleaseName,
                },
                ...existingChapters,
              ];
            }
          }
        }

        return {
          ...prev,
          facts: nextFacts,
          sources: nextSources,
          chapters: updatedChapters,
        };
      });

      setDirectSyncFeedback({
        type: 'success',
        message: `Manual sync complete. Detected chapter data from ${result.sourceResults.length} of ${validSources.length} source${validSources.length === 1 ? '' : 's'}.`,
        sourceResults: result.sourceResults,
        sourceIssues: result.sourceIssues,
      });
    } catch (err: unknown) {
      setDirectSyncFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to scan direct sources.',
      });
    } finally {
      setIsSyncingDirect(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtered titles for Main List (Image 1)
  const filteredTitles = useMemo(() => {
    const filtered = catalogItems.filter((item) => {
      if (typeFilter !== 'All types') {
        const itemType = (item.category || item.facts?.type || '').toLowerCase(); if (!itemType || itemType !== typeFilter.toLowerCase()) return false;
      }
      if (statusFilter !== 'All statuses') {
        const itemStatus = (item.status || '').toLowerCase();
        const filterNorm = statusFilter.toLowerCase();
        if (filterNorm === 'releasing' && itemStatus !== 'releasing' && itemStatus !== 'ongoing') return false;
        if (filterNorm !== 'releasing' && itemStatus !== filterNorm) return false;
      }
      const searchTerm = (globalSearch.trim() || listSearch.trim()).toLowerCase();
      if (searchTerm) {
        const term = searchTerm;
        const matchTitle = item.title.toLowerCase().includes(term);
        const matchSlug = item.slug.toLowerCase().includes(term);
        const matchAlt = item.alternateTitles?.some((alt) => alt.toLowerCase().includes(term));
        if (!matchTitle && !matchSlug && !matchAlt) return false;
      }
      return true;
    });
    // Sort by date added (createdAt) or id as fallback
    filtered.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : (a.id || 0);
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : (b.id || 0);
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });
    return filtered;
  }, [catalogItems, globalSearch, listSearch, typeFilter, statusFilter, sortOrder]);

  const newTaggedSeries = useMemo(() => catalogItems
    .filter((item) => item.isNew || item.facts?.is_new === 'true')
    .sort((left, right) => {
      const leftIndex = newSeriesOrder.indexOf(String(left.id));
      const rightIndex = newSeriesOrder.indexOf(String(right.id));
      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) return -1;
        if (rightIndex === -1) return 1;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
      }
      const leftCreated = left.createdAt ? new Date(left.createdAt).getTime() : (left.id || 0);
      const rightCreated = right.createdAt ? new Date(right.createdAt).getTime() : (right.id || 0);
      return rightCreated - leftCreated;
    }), [catalogItems, newSeriesOrder]);

  const moveNewSeries = (sourceId: number, targetId: number) => {
    if (sourceId === targetId || isSavingNewSeriesOrder || !onSaveNewSeriesOrder) return;
    const orderedIds = newTaggedSeries.map((item) => item.id);
    const sourceIndex = orderedIds.indexOf(sourceId);
    const targetIndex = orderedIds.indexOf(targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    orderedIds.splice(sourceIndex, 1);
    orderedIds.splice(targetIndex, 0, sourceId);
    void onSaveNewSeriesOrder(orderedIds.map(String));
  };

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
      setSeriesPendingDelete(null);
    },
    onError: (err: any) => {
      alert(err?.message || 'Failed to delete series.');
    },
  });

  // Add chapter mutation
  const addChapterMutation = useMutation({
    mutationFn: addSeriesChapter,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SERIES_CATALOG_QUERY_KEY });
      setSelectedSeriesForChapter(null);
      setChapterTitleInput('');
      setChapterError(null);
      setIsModalOpen(false);
      setMainTab('chapters');
    },
    onError: (err: any) => {
      setChapterError(err?.message || 'Failed to add chapter.');
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
        rating: data.rating || current.rating,
        trackers: data.trackerUrl && !current.trackers.some((t) => t.url.includes(data.id))
          ? [
              ...current.trackers,
              {
                name: data.trackerUrl.includes('mangabaka')
                  ? 'MangaBaka'
                  : data.trackerUrl.includes('mangaupdates')
                  ? 'MangaUpdates'
                  : 'MangaDex',
                url: data.trackerUrl,
                logo: '',
                isSample: false,
                rating: data.rating,
              },
            ]
          : current.trackers,
        sources: data.sources?.length
          ? [
              ...current.sources,
              ...data.sources
                .filter((s) => !current.sources.some((cs) => cs.url.trim().toLowerCase() === s.url.trim().toLowerCase()))
                .map((s) => ({ name: s.name, url: s.url, logo: '', isSample: false, rating: s.rating })),
            ]
          : current.sources,
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

  // Cover file upload handler (compresses to ~25KB or uploads to Supabase Storage)
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPG, PNG, or WEBP).');
      return;
    }

    try {
      const coverResult = await uploadOrCompressCover(file, draft.title || 'cover');
      if (coverResult) {
        setDraft((curr) => ({ ...curr, cover: coverResult }));
      }
    } catch (err: any) {
      console.error('Failed to process image cover:', err);
      alert('Failed to process cover image. Please try another image.');
    }
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
    setDraft((curr) => ({ ...curr, alternateTitles: [...curr.alternateTitles, ''] }));
  };

  const removeAltTitle = (index: number) => {
    setDraft((curr) => ({
      ...curr,
      alternateTitles: curr.alternateTitles.filter((_, i) => i !== index),
    }));
  };

  const allExistingAuthors = useMemo(() => {
    const set = new Set<string>();
    for (const item of catalogItems) {
      if (item.author) {
        item.author.split(',').forEach((s) => {
          const clean = s.trim();
          if (clean) set.add(clean);
        });
      }
      if (item.facts?.author) {
        item.facts.author.split(',').forEach((s) => {
          const clean = s.trim();
          if (clean) set.add(clean);
        });
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [catalogItems]);

  const allExistingArtists = useMemo(() => {
    const set = new Set<string>();
    for (const item of catalogItems) {
      if (item.artist) {
        item.artist.split(',').forEach((s) => {
          const clean = s.trim();
          if (clean) set.add(clean);
        });
      }
      if (item.facts?.artist) {
        item.facts.artist.split(',').forEach((s) => {
          const clean = s.trim();
          if (clean) set.add(clean);
        });
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [catalogItems]);

  const allExistingPublishers = useMemo(() => {
    const set = new Set<string>();
    for (const item of catalogItems) {
      if (Array.isArray(item.publishers)) {
        item.publishers.forEach((p) => {
          const clean = p.trim();
          if (clean) set.add(clean);
        });
      }
      if (item.facts?.publisher) {
        item.facts.publisher.split(',').forEach((p) => {
          const clean = p.trim();
          if (clean) set.add(clean);
        });
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [catalogItems]);

  const addAuthor = (valueToAdd?: string) => {
    const val = (valueToAdd !== undefined ? valueToAdd : newAuthor).trim();
    if (val && !draft.authors.includes(val)) {
      setDraft((curr) => ({ ...curr, authors: [...curr.authors, val] }));
    }
    setNewAuthor('');
  };

  const addArtist = (valueToAdd?: string) => {
    const val = (valueToAdd !== undefined ? valueToAdd : newArtist).trim();
    if (val && !draft.artists.includes(val)) {
      setDraft((curr) => ({ ...curr, artists: [...curr.artists, val] }));
    }
    setNewArtist('');
  };

  const addPublisher = (valueToAdd?: string) => {
    const val = (valueToAdd !== undefined ? valueToAdd : newPublisher).trim();
    if (val && !draft.publishers.includes(val)) {
      setDraft((curr) => ({ ...curr, publishers: [...curr.publishers, val] }));
    }
    setNewPublisher('');
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

    // Flush any pending tag-style inputs that weren't yet confirmed with Enter
    const pendingAuthor = newAuthor.trim();
    const pendingArtist = newArtist.trim();
    const pendingPublisher = newPublisher.trim();
    const finalAuthors = pendingAuthor && !draft.authors.includes(pendingAuthor)
      ? [...draft.authors, pendingAuthor]
      : draft.authors;
    const finalArtists = pendingArtist && !draft.artists.includes(pendingArtist)
      ? [...draft.artists, pendingArtist]
      : draft.artists;
    const finalPublishers = pendingPublisher && !draft.publishers.includes(pendingPublisher)
      ? [...draft.publishers, pendingPublisher]
      : draft.publishers;

    const title = draft.title.trim();
    if (!title) {
      setSubmitError('Title is required.');
      return;
    }

    if (!draft.year.trim()) {
      setSubmitError('Year is required.');
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
        isNew: draft.isNew,
        synopsis: draft.synopsis.trim() || undefined,
        alternateTitles: draft.alternateTitles.map((alt) => alt.trim()).filter(Boolean),
        author: finalAuthors.join(', ') || undefined,
        artist: finalArtists.join(', ') || undefined,
        publishers: finalPublishers,
        contentRating: draft.contentRating || 'Safe',
        year: draft.year ? Number(draft.year) : undefined,
        originalLanguage: draft.originalLanguage || undefined,
        demographics: draft.demographics,
        genres: draft.genres,
        formats: draft.formats,
        tags: draft.tags,
        trackers: draft.trackers.filter((t) => t.name && t.url),
        sources: draft.sources.filter((s) => s.name && s.url),
        rating: draft.rating || undefined,
        chapters: draft.chapters,
        facts: { ...(draft.facts || {}), type: draft.category || 'Manga' },
      };
      updateSeriesMutation.mutate(updatePayload);
    } else {
      const payload: CreateSeriesRequest = {
        title,
        cover: draft.cover.trim() || undefined,
        category: draft.category || 'Manga',
        status: draft.status || 'Releasing',
        isNew: draft.isNew,
        synopsis: draft.synopsis.trim() || undefined,
        alternateTitles: draft.alternateTitles.map((alt) => alt.trim()).filter(Boolean).length
          ? draft.alternateTitles.map((alt) => alt.trim()).filter(Boolean)
          : undefined,
        author: finalAuthors.join(', ') || undefined,
        artist: finalArtists.join(', ') || undefined,
        publishers: finalPublishers.length ? finalPublishers : undefined,
        contentRating: draft.contentRating || 'Safe',
        year: draft.year ? Number(draft.year) : undefined,
        originalLanguage: draft.originalLanguage || undefined,
        demographics: draft.demographics.length ? draft.demographics : undefined,
        genres: draft.genres.length ? draft.genres : undefined,
        formats: draft.formats.length ? draft.formats : undefined,
        tags: draft.tags.length ? draft.tags : undefined,
        trackers: draft.trackers.filter((t) => t.name && t.url),
        sources: draft.sources.filter((s) => s.name && s.url),
        rating: draft.rating || undefined,
        chapters: draft.chapters,
        facts: { ...(draft.facts || {}), type: draft.category || 'Manga' },
      };
      createSeriesMutation.mutate(payload);
    }
  };

  const syncSourcesModalElement = isSyncSourcesOpen ? (
    <div className="modal-backdrop" onClick={() => setIsSyncSourcesOpen(false)}>
      <div className="modal-dialog-card modal-sync-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="sync-modal-icon-badge">
              <Zap size={16} />
            </div>
            <div>
              <h2 className="modal-title" style={{ margin: 0 }}>Sync Translation Sources</h2>
              <small style={{ color: '#94a3b8', fontSize: 11 }}>Auto-discover scanlator groups and chapter counts</small>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => setIsSyncSourcesOpen(false)}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSyncSources(syncQuery);
          }}
          className="sync-search-row"
        >
          <div className="sync-search-input-wrap">
            <Search size={15} className="sync-search-icon" />
            <input
              type="text"
              placeholder="Enter series title (e.g. Solo Leveling)"
              value={syncQuery}
              onChange={(e) => {
                setSyncQuery(e.target.value);
                // A previous empty-title/search error is no longer relevant once
                // the user starts entering a title.
                setSyncError(null);
              }}
              disabled={isSyncing}
            />
          </div>
          <button
            type="submit"
            className="btn-dark"
            disabled={isSyncing || !syncQuery.trim()}
            style={{ padding: '0 16px', minWidth: 90, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {isSyncing ? (
              <>
                <LoaderCircle size={14} className="spin-animate" />
                <span>Searching…</span>
              </>
            ) : (
              <>
                <Search size={14} />
                <span>Search</span>
              </>
            )}
          </button>
        </form>

        {/* Error Banner */}
        {syncError && (
          <div className="sync-search-error" role="alert">
            <AlertCircle size={15} />
            <span>{syncError}</span>
          </div>
        )}

        {syncError && (!syncResult || syncResult.sources.length === 0) && (
          <div className="sync-direct-link-tip">
            <strong>Direct Link Tip:</strong> If MangaUpdates has no records for this series, you can close this modal, paste your direct scanlator URLs (e.g. Asura, Qi Manga) directly into the <strong>Sources</strong> list, and click the new <strong>Manual Sync</strong> button!
          </div>
        )}

        {/* Matched Series Card */}
        {syncResult?.matchedSeries && (
          <div className="sync-series-card">
            {syncResult.matchedSeries.image ? (
              <img src={syncResult.matchedSeries.image} alt="" className="sync-series-thumb" />
            ) : (
              <div className="sync-series-thumb sync-series-thumb-placeholder">
                <BookOpen size={18} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14, color: '#f8fafc' }}>
                  {syncResult.matchedSeries.title}
                </strong>
                {syncResult.matchedSeries.year && (
                  <span className="sync-meta-pill">
                    {syncResult.matchedSeries.year}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                {syncResult.matchedSeries.status && (
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    {syncResult.matchedSeries.status}
                  </span>
                )}
                {syncResult.matchedSeries.totalChapters && (
                  <span className="sync-ch-pill">
                    {syncResult.matchedSeries.totalChapters} chapters total
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Source Results Controls (Filter tabs & Select all) */}
        {syncResult && syncResult.sources.length > 0 && (
          <div className="sync-controls-row">
            <div className="sync-filter-pills">
              <button
                type="button"
                className={`sync-filter-pill ${syncFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setSyncFilter('all')}
              >
                All ({syncResult.sources.length})
              </button>
              <button
                type="button"
                className={`sync-filter-pill ${syncFilter === 'scanlator' ? 'is-active' : ''}`}
                onClick={() => setSyncFilter('scanlator')}
              >
                Scanlators ({syncResult.sources.filter((s) => s.type === 'scanlator').length})
              </button>
              <button
                type="button"
                className={`sync-filter-pill ${syncFilter === 'official' ? 'is-active' : ''}`}
                onClick={() => setSyncFilter('official')}
              >
                Official ({syncResult.sources.filter((s) => s.type === 'official').length})
              </button>
            </div>

            <div className="sync-select-helpers">
              <button
                type="button"
                className="sync-link-btn"
                onClick={() => {
                  const allIdxs = new Set(syncResult.sources.map((_, i) => i));
                  setSelectedSourceIndices(allIdxs);
                }}
              >
                Select all
              </button>
              <span style={{ color: '#475569' }}>•</span>
              <button
                type="button"
                className="sync-link-btn"
                onClick={() => setSelectedSourceIndices(new Set())}
              >
                Deselect all
              </button>
            </div>
          </div>
        )}

        {/* List of Detected Sources */}
        {syncResult && syncResult.sources.length > 0 && (
          <div className="sync-sources-scroll-area">
            {syncResult.sources
              .map((src, originalIdx) => ({ src, originalIdx }))
              .filter(({ src }) => (syncFilter === 'all' ? true : src.type === syncFilter))
              .map(({ src, originalIdx }) => {
                const isSelected = selectedSourceIndices.has(originalIdx);
                return (
                  <div
                    key={originalIdx}
                    className={`sync-source-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      const next = new Set(selectedSourceIndices);
                      if (isSelected) next.delete(originalIdx);
                      else next.add(originalIdx);
                      setSelectedSourceIndices(next);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        style={{ cursor: 'pointer', accentColor: '#6366f1' }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <strong style={{ fontSize: 13, color: '#f8fafc' }}>{src.name}</strong>
                          {src.active && <span className="sync-active-dot" title="Active group" />}
                          <span className={`sync-type-tag is-${src.type}`}>
                            {src.type === 'scanlator' ? 'Scanlator' : 'Official'}
                          </span>
                        </div>
                        {src.url ? (
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noreferrer"
                            className="sync-source-url"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span>{src.url.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</span>
                            <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span style={{ fontSize: 11, color: '#64748b' }}>No website listed</span>
                        )}
                      </div>
                    </div>

                    {src.chapterCount && (
                      <div className="sync-ch-badge">
                        <BookOpen size={12} />
                        <span>{src.chapterCount}</span>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* Footer with Import Button */}
        <div className="modal-footer sync-modal-footer" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn-light"
            onClick={() => setIsSyncSourcesOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-create"
            disabled={!syncResult || selectedSourceIndices.size === 0}
            onClick={handleImportSelectedSources}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              borderColor: '#6366f1',
              color: '#ffffff',
            }}
          >
            <Check size={15} />
            <span>Import {selectedSourceIndices.size} Source{selectedSourceIndices.size === 1 ? '' : 's'}</span>
          </button>
        </div>
      </div>
    </div>
  ) : null;

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
              Paste a MangaDex, MangaBaka, or MangaUpdates link to auto-fill title, cover, and details. You can also upload your own cover.
            </p>

            <div className="import-row">
              <input
                type="text"
                className="import-input"
                placeholder="Paste MangaDex, MangaBaka, or MangaUpdates URL"
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
              <div className="alt-title-edit-list">
                {draft.alternateTitles.map((alt, idx) => (
                  <div key={idx} className="alt-title-edit-row">
                    <input
                      type="text"
                      className="text-input"
                      placeholder="Alternative title..."
                      value={alt}
                      onChange={(e) => setDraft((curr) => ({
                        ...curr,
                        alternateTitles: curr.alternateTitles.map((title, titleIndex) => titleIndex === idx ? e.target.value : title),
                      }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.preventDefault();
                      }}
                    />
                    <button type="button" className="alt-title-remove-button" onClick={() => removeAltTitle(idx)} aria-label={`Remove alternative title ${idx + 1}`}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="alt-title-add-button" onClick={addAltTitle}>
                <Plus size={18} aria-hidden="true" />
                <span>Add alternative title</span>
              </button>
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

            <CreditsAutocompleteField
              label="Authors"
              items={draft.authors}
              onRemoveItem={(i) => setDraft((c) => ({ ...c, authors: c.authors.filter((_, idx) => idx !== i) }))}
              onAddItem={addAuthor}
              placeholder="Add author..."
              existingSuggestions={allExistingAuthors}
              buttonText="Add author"
              inputValue={newAuthor}
              onInputChange={setNewAuthor}
            />

            <CreditsAutocompleteField
              label="Artists"
              items={draft.artists}
              onRemoveItem={(i) => setDraft((c) => ({ ...c, artists: c.artists.filter((_, idx) => idx !== i) }))}
              onAddItem={addArtist}
              placeholder="Add artist..."
              existingSuggestions={allExistingArtists}
              buttonText="Add artist"
              inputValue={newArtist}
              onInputChange={setNewArtist}
            />

            <CreditsAutocompleteField
              label="Publishers"
              items={draft.publishers}
              onRemoveItem={(i) => setDraft((c) => ({ ...c, publishers: c.publishers.filter((_, idx) => idx !== i) }))}
              onAddItem={addPublisher}
              placeholder="Add publisher..."
              existingSuggestions={allExistingPublishers}
              buttonText="Add publisher"
              inputValue={newPublisher}
              onInputChange={setNewPublisher}
            />
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
                    onChange={(e) => {
                      const category = e.target.value;
                      const languageByType: Record<string, string> = {
                        Manhwa: 'Korean',
                        Manga: 'Japanese',
                        Manhua: 'Chinese',
                      };
                      setDraft((c) => ({
                        ...c,
                        category,
                        originalLanguage: languageByType[category] || c.originalLanguage,
                      }));
                    }}
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
                <label className="field-label">
                  Year <span className="required-star">*</span>
                </label>
                <input
                  type="number"
                  min="1000"
                  max="9999"
                  step="1"
                  className="text-input"
                  placeholder="e.g. 2024"
                  value={draft.year}
                  required
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

              <div className="field-group grid-full-span">
                <label className="field-label">
                  New series (feature in "New" releases tab) <span className="required-star">*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`toggle-pill ${draft.isNew ? 'is-selected' : ''}`}
                    style={{ padding: '8px 18px', fontWeight: 600, fontSize: 13 }}
                    onClick={() => setDraft((c) => ({ ...c, isNew: true }))}
                  >
                    ✓ Yes (New series)
                  </button>
                  <button
                    type="button"
                    className={`toggle-pill ${!draft.isNew ? 'is-selected' : ''}`}
                    style={{ padding: '8px 18px', fontWeight: 600, fontSize: 13 }}
                    onClick={() => setDraft((c) => ({ ...c, isNew: false }))}
                  >
                    ✕ No (Regular series)
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--up-text-muted)' }}>
                    {draft.isNew
                      ? 'Enabled: This series will appear under the "New" tab in Latest Releases.'
                      : 'Disabled: This series will only appear under regular "Latest" releases.'}
                  </span>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
              <div>
                <h2 className="section-title" style={{ margin: 0 }}>Sources</h2>
                <p className="section-description" style={{ margin: 0 }}>Scanlator teams, translation groups, and official platforms</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-sync-sources"
                  onClick={() => openSyncSourcesModal(draft.title)}
                  title="Search and auto-detect scanlators, chapters, and links across the web"
                >
                  <Zap size={14} />
                  <span>Sync Sources</span>
                </button>
                <button
                  type="button"
                  className="btn-sync-direct-sources"
                  disabled={isSyncingDirect || draft.sources.filter((s) => s.url?.trim()).length === 0}
                  onClick={handleManualSyncDirectSources}
                  title="Scan the direct source URLs entered below to auto-detect and update chapters for this series"
                >
                  <RefreshCw size={14} className={isSyncingDirect ? 'spin' : ''} />
                  <span>{isSyncingDirect ? 'Scanning...' : 'Manual Sync'}</span>
                </button>
              </div>
            </div>

            {directSyncFeedback && (
              <div
                className={`manual-sync-feedback manual-sync-feedback--${directSyncFeedback.type}`}
                role="status"
                aria-live="polite"
              >
                {directSyncFeedback.type === 'success' ? <Check size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
                <div className="manual-sync-feedback__content">
                  <p className="manual-sync-feedback__summary">{directSyncFeedback.message}</p>
                  {directSyncFeedback.sourceResults && directSyncFeedback.sourceResults.length > 0 && (
                    <ul className="manual-sync-feedback__sources">
                      {directSyncFeedback.sourceResults.map((source) => (
                        <li key={source.url}>
                          Latest is Chapter {source.latestChapterNumber.replace(/^ch(?:apter)?\.?\s*/i, '')} ({formatDetectedSourceAge(source.latestChapterAt)}) (reported by {source.name})
                        </li>
                      ))}
                    </ul>
                  )}
                  {directSyncFeedback.sourceIssues && directSyncFeedback.sourceIssues.length > 0 && (
                    <ul className="manual-sync-feedback__sources manual-sync-feedback__sources--issues">
                      {directSyncFeedback.sourceIssues.map((source) => (
                        <li key={source.url}>
                          No chapter data detected for {source.name}: {source.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDirectSyncFeedback(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                  }}
                  aria-label="Dismiss feedback"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {draft.sources.map((source, idx) => (
              <div key={idx} className="link-edit-row">
                <SourceNameAutocomplete
                  value={source.name}
                  suggestions={customSourceNames}
                  onChange={(val) => {
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
                <input
                  type="text"
                  className="text-input"
                  style={{ width: '90px', flex: '0 0 auto' }}
                  placeholder="⭐ 9.5"
                  title="Source rating (e.g. 9.5)"
                  value={source.rating || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDraft((c) => ({
                      ...c,
                      sources: c.sources.map((s, i) => (i === idx ? { ...s, rating: val } : s)),
                    }));
                  }}
                />
                <button
                  type="button"
                  className="btn-icon-danger"
                  aria-label={`Remove ${source.name || 'source'}`}
                  onClick={() => setPendingSourceRemovalIndex(idx)}
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
        {syncSourcesModalElement}
        <ConfirmationDialog
          open={pendingSourceRemovalIndex !== null}
          onOpenChange={(open) => {
            if (!open) setPendingSourceRemovalIndex(null);
          }}
          title="Remove source?"
          description={pendingSourceRemovalIndex === null
            ? ''
            : `Remove “${draft.sources[pendingSourceRemovalIndex]?.name || 'this source'}” from this title? The change will be applied when you save.`}
          confirmLabel="Remove source"
          onConfirm={() => {
            if (pendingSourceRemovalIndex === null) return;
            const index = pendingSourceRemovalIndex;
            setDraft((current) => ({
              ...current,
              sources: current.sources.filter((_, sourceIndex) => sourceIndex !== index),
            }));
            setPendingSourceRemovalIndex(null);
          }}
        />
      </div>
    );
  }

  // ==========================================
  // RENDER: IMAGE 1 & 2 — MAIN UPLOADS VIEW
  // ==========================================
  return (
    <div className="uploads-theme-container">
      {/* Top Header Row (Image 1) */}
      <BackgroundSyncTimer onManualTriggerSuccess={() => queryClient.invalidateQueries({ queryKey: SERIES_CATALOG_QUERY_KEY })} />

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
      <div className={`uploads-nav-tabs ${mainTab === 'new-order' ? 'has-new-order' : ''}`}>
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
          Sync Logs
        </button>
        <button
          type="button"
          className={`uploads-tab ${mainTab === 'new-order' ? 'is-active' : ''}`}
          onClick={() => setMainTab('new-order')}
        >
          New Series Order <span className="comix-order-count">{newTaggedSeries.length}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      {mainTab === 'titles' && <div className="uploads-filter-bar">
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

        <div className="filter-dropdown-wrap">
          <select
            className="filter-select"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <ChevronDown className="select-arrow" size={14} />
        </div>
      </div>}

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
                    {series.isNew && (
                      <span className="badge-tag" style={{ background: '#059669', color: '#fff', fontWeight: 600 }}>
                        New
                      </span>
                    )}
                  </div>
                  <div className="title-stats">
                    <span>{series.facts?.latest_chapter_number ? `Ch. ${series.facts.latest_chapter_number}` : `${series.chapters?.length || 0} chapters`}</span>
                    <span>{series.sources?.length ?? 0} sources</span>
                  </div>
                </div>
                <div className="title-actions">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="title-actions-trigger"
                        aria-label={`More actions for ${series.title}`}
                        title="More actions"
                      >
                        <MoreVertical size={18} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={6} className="title-actions-menu">
                      <DropdownMenuItem
                        className="title-actions-menu-item"
                        aria-label="Edit"
                        data-label="Edit"
                        onSelect={() => {
                          setEditingSeriesId(series.id);
                          setDraft({
                            title: series.title || '',
                            cover: series.cover || '',
                            category: series.category || 'Manga',
                            status: series.status || 'Ongoing',
                            isNew: series.isNew ?? (series.facts?.is_new === 'true' || false),
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
                            sources: series.sources ? series.sources.map((s) => ({ ...s, logo: s.logo || '', isSample: !!s.isSample, rating: s.rating || '' })) : [],
                            chapters: series.chapters || [],
                            facts: series.facts || {},
                            rating: series.rating || '',
                          });
                          setImportUrl('');
                          setImportError(null);
                          setDuplicateTitle(null);
                          setImportSuccess(null);
                          setSubmitError(null);
                          setView('new-title');
                        }}
                      >
                        <Edit2 size={15} />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="title-actions-menu-item is-danger"
                        aria-label="Delete"
                        data-label="Delete"
                        disabled={deleteSeriesMutation.isPending}
                        onSelect={() => setSeriesPendingDelete(series)}
                      >
                        <Trash2 size={15} />
                        Delete
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="title-actions-menu-item" aria-label="View" data-label="View">
                        <a
                          href={series.href || `/series/${series.slug}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink size={15} />
                          View
                        </a>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )
      ) : mainTab === 'chapters' ? (
        /* Sync Logs Tab */
        <SyncActivityLogs />
      ) : (
        <section className="comix-new-series-order" aria-labelledby="new-series-order-heading">
          <div className="comix-setting-group-title">
            <h4 id="new-series-order-heading">Series tagged New</h4>
            <p>Drag a series to change its position in the homepage New releases tab. Changes save automatically.</p>
            {(newSeriesOrderSaveMessage === 'Saving...' || newSeriesOrderSaveMessage === 'Error saving') && (
              <span className={`comix-new-series-save-status ${newSeriesOrderSaveMessage === 'Error saving' ? 'is-error' : ''}`} role="status">
                {newSeriesOrderSaveMessage}
              </span>
            )}
          </div>
          {newTaggedSeries.length === 0 ? (
            <div className="comix-new-series-empty">No series are currently tagged New.</div>
          ) : (
            <div className="comix-new-series-list" role="list" aria-label="Series tagged New, ordered for homepage display">
              {newTaggedSeries.map((series, index) => (
                <div
                  key={series.id}
                  className={`comix-new-series-row ${draggedNewSeriesId === series.id ? 'is-dragging' : ''} ${dragOverNewSeriesId === series.id ? 'is-drop-target' : ''}`}
                  role="listitem"
                  draggable={!isSavingNewSeriesOrder && Boolean(onSaveNewSeriesOrder)}
                  onDragStart={(event) => {
                    setDraggedNewSeriesId(series.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(series.id));
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDragOverNewSeriesId(series.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const sourceId = Number(event.dataTransfer.getData('text/plain')) || draggedNewSeriesId;
                    if (sourceId !== null) moveNewSeries(sourceId, series.id);
                    setDraggedNewSeriesId(null);
                    setDragOverNewSeriesId(null);
                  }}
                  onDragEnd={() => {
                    setDraggedNewSeriesId(null);
                    setDragOverNewSeriesId(null);
                  }}
                >
                  <GripVertical className="comix-new-series-grip" size={18} aria-hidden="true" />
                  <span className="comix-new-series-position">{index + 1}</span>
                  <img src={series.cover} alt="" loading="lazy" />
                  <span className="comix-new-series-title">{series.title}</span>
                  <span className="comix-new-series-tag">New</span>
                  <div className="comix-new-series-controls" aria-label={`Move ${series.title}`}>
                    <button
                      type="button"
                      aria-label={`Move ${series.title} up`}
                      disabled={isSavingNewSeriesOrder || index === 0}
                      onClick={() => moveNewSeries(series.id, newTaggedSeries[index - 1].id)}
                    ><ArrowUp size={14} /></button>
                    <button
                      type="button"
                      aria-label={`Move ${series.title} down`}
                      disabled={isSavingNewSeriesOrder || index === newTaggedSeries.length - 1}
                      onClick={() => moveNewSeries(series.id, newTaggedSeries[index + 1].id)}
                    ><ArrowDown size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ========================================== */}
      {/* IMAGE 2: UPLOAD CHAPTER MODAL DIALOG       */}
      {/* ========================================== */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => { setIsModalOpen(false); setSelectedSeriesForChapter(null); setChapterError(null); }}>
          <div className="modal-dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{selectedSeriesForChapter ? `Add Chapter to "${selectedSeriesForChapter.title}"` : 'Upload chapter'}</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => { setIsModalOpen(false); setSelectedSeriesForChapter(null); setChapterError(null); }}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {selectedSeriesForChapter ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#0f172a', borderRadius: 8, border: '1px solid #1e293b' }}>
                  <div className="result-thumb">
                    {selectedSeriesForChapter.cover ? <img src={selectedSeriesForChapter.cover} alt="" /> : <BookOpen size={16} />}
                  </div>
                  <div className="result-info">
                    <strong>{selectedSeriesForChapter.title}</strong>
                    <small style={{ color: '#94a3b8', display: 'block' }}>{selectedSeriesForChapter.chapters?.length || 0} existing chapters</small>
                  </div>
                </div>

                {chapterError && (
                  <div className="uploads-error-banner" style={{ margin: 0 }}>
                    {chapterError}
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#e2e8f0' }}>Chapter Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Chapter 1"
                    value={chapterTitleInput}
                    onChange={(e) => setChapterTitleInput(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: 14 }}
                    autoFocus
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#e2e8f0' }}>Status Badge</label>
                  <select
                    value={chapterStatusInput}
                    onChange={(e) => setChapterStatusInput(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: 14 }}
                  >
                    <option value="New">New</option>
                    <option value="Free now">Free now</option>
                  </select>
                </div>

                <div className="modal-buttons-group" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn-dark"
                    onClick={() => { setSelectedSeriesForChapter(null); setChapterError(null); }}
                  >
                    Back to search
                  </button>
                  <button
                    type="button"
                    className="btn-teal"
                    disabled={addChapterMutation.isPending || !chapterTitleInput.trim()}
                    onClick={() => {
                      if (!chapterTitleInput.trim()) return;
                      addChapterMutation.mutate({
                        seriesId: selectedSeriesForChapter.id,
                        chapterTitle: chapterTitleInput.trim(),
                        status: chapterStatusInput,
                      });
                    }}
                  >
                    {addChapterMutation.isPending ? 'Adding chapter...' : 'Add Chapter'}
                  </button>
                </div>
              </div>
            ) : (
              <>
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
                          setSelectedSeriesForChapter(item);
                          setChapterTitleInput(`Chapter ${(item.chapters?.length || 0) + 1}`);
                          setChapterStatusInput('New');
                          setChapterError(null);
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
              </>
            )}
          </div>
        </div>
      )}

      {syncSourcesModalElement}
      <ConfirmationDialog
        open={seriesPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setSeriesPendingDelete(null);
        }}
        title="Delete title?"
        description={seriesPendingDelete
          ? `Are you sure you want to delete “${seriesPendingDelete.title}”? This cannot be undone.`
          : ''}
        confirmLabel="Delete title"
        pending={deleteSeriesMutation.isPending}
        onConfirm={() => {
          if (seriesPendingDelete) deleteSeriesMutation.mutate(seriesPendingDelete.id);
        }}
      />
    </div>
  );
}
