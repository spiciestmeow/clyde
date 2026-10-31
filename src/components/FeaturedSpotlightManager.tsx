import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowDown, ArrowUp, Check, Image as ImageIcon, LoaderCircle, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import { getSiteSettings, saveSiteSettings, type FeaturedSpotlightItem, type SiteSettings } from '../lib/siteSettings';
import { uploadOrCompressCover } from '../lib/imageUpload';

export default function FeaturedSpotlightManager({
  settings,
  onSave,
}: {
  settings?: SiteSettings | null;
  onSave?: (updated: SiteSettings) => void;
}) {
  const catalogQuery = useSeriesCatalog();
  const catalogItems = catalogQuery.items;
  const [items, setItems] = useState<FeaturedSpotlightItem[]>(settings?.featuredSpotlightItems ?? []);
  const [search, setSearch] = useState('');
  const [uploadingSeriesId, setUploadingSeriesId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const fileInputsRef = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    if (settings?.featuredSpotlightItems) setItems(settings.featuredSpotlightItems);
  }, [settings?.featuredSpotlightItems]);

  const seriesById = useMemo(() => new Map(catalogItems.map((series) => [series.id, series])), [catalogItems]);
  const searchMatches = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return [];
    const selectedIds = new Set(items.map((item) => item.seriesId));
    return catalogItems
      .filter((series) => !selectedIds.has(series.id) && (series.title.toLocaleLowerCase().includes(term) || series.slug.toLocaleLowerCase().includes(term)))
      .slice(0, 8);
  }, [catalogItems, items, search]);

  const addSeries = (seriesId: number) => {
    if (items.length >= 6 || items.some((item) => item.seriesId === seriesId)) return;
    setItems([...items, { seriesId, image: '' }]);
    setSearch('');
    setSaveStatus('');
  };

  const updateImage = async (seriesId: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const fileName = file.name.toLocaleLowerCase();
    const isSupportedImage = ['image/png', 'image/webp'].includes(file.type)
      || fileName.endsWith('.png')
      || fileName.endsWith('.webp');
    if (!isSupportedImage) {
      window.alert('Please upload a PNG or WebP image with a transparent background.');
      return;
    }
    const series = seriesById.get(seriesId);
    if (!series) return;
    setUploadingSeriesId(seriesId);
    setSaveStatus('');
    try {
      const image = await uploadOrCompressCover(file, `spotlight-${series.slug}`);
      setItems((current) => current.map((item) => item.seriesId === seriesId ? { ...item, image } : item));
    } catch (error) {
      console.error('Could not upload featured spotlight artwork:', error);
      window.alert('Could not upload this image. Please try another PNG or WebP file.');
    } finally {
      setUploadingSeriesId(null);
    }
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSaveStatus('');
  };

  const saveItems = async () => {
    if (items.some((item) => !item.image)) {
      setSaveStatus('Upload transparent PNG or WebP art for each selected series before saving.');
      return;
    }
    setIsSaving(true);
    setSaveStatus('Saving spotlight...');
    try {
      const currentSettings = settings ?? await getSiteSettings();
      const saved = await saveSiteSettings({ ...currentSettings, featuredSpotlightItems: items });
      onSave?.(saved);
      setItems(saved.featuredSpotlightItems);
      setSaveStatus('Featured Series spotlight saved.');
    } catch (error) {
      console.error('Could not save Featured Series spotlight:', error);
      setSaveStatus('Could not save. Check the admin connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="comix-settings-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ marginBottom: 4, color: 'var(--cx-teal)', fontSize: 11, fontWeight: 700, letterSpacing: '.08em' }}>HOMEPAGE FEATURED</div>
          <h2 style={{ margin: '0 0 6px', color: 'var(--cx-text)', fontSize: 22, fontWeight: 700 }}>Featured Series Spotlight</h2>
          <p style={{ maxWidth: 650, margin: 0, color: 'var(--cx-text-muted)', fontSize: 13 }}>
            Pick up to six series, choose their order, and upload transparent PNG or WebP character artwork. Titles, genres, and reading links come from the series catalog.
          </p>
        </div>
        <button type="button" className="btn-dark" onClick={() => void saveItems()} disabled={isSaving || uploadingSeriesId !== null} style={{ minWidth: 150 }}>
          {isSaving ? <LoaderCircle className="spin-icon" size={15} /> : <Check size={15} />}
          {isSaving ? 'Saving...' : 'Save spotlight'}
        </button>
      </div>

      {saveStatus && (
        <div role="status" style={{ marginBottom: 16, padding: '10px 14px', border: '1px solid var(--cx-border)', borderRadius: 7, color: saveStatus.startsWith('Could not') || saveStatus.startsWith('Upload') ? '#f87171' : 'var(--cx-text)', fontSize: 13 }}>
          {saveStatus}
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 16 }}>
        <label className="field-label" htmlFor="featured-spotlight-series-search">Add series ({items.length}/6)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 8 }}>
            <Search size={15} style={{ flex: 'none', color: 'var(--cx-text-subtle)' }} />
            <input
              id="featured-spotlight-series-search"
              className="text-input"
              type="search"
              placeholder={items.length >= 6 ? 'Spotlight is limited to six series' : 'Search the series catalog'}
              value={search}
              disabled={items.length >= 6}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        {searchMatches.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 20, top: '100%', right: 0, left: 0, maxHeight: 250, overflowY: 'auto', border: '1px solid var(--cx-border)', borderRadius: 7, background: 'var(--cx-surface)', boxShadow: '0 12px 30px #0004' }}>
            {searchMatches.map((series) => (
              <button key={series.id} type="button" onClick={() => addSeries(series.id)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '9px 12px', border: 0, borderBottom: '1px solid var(--cx-border)', background: 'transparent', color: 'var(--cx-text)', textAlign: 'left' }}>
                <img src={series.cover} alt="" style={{ width: 30, height: 40, flex: 'none', borderRadius: 3, objectFit: 'cover' }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{series.title}</span>
                <Plus size={15} style={{ color: 'var(--cx-teal)' }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ display: 'grid', minHeight: 170, placeItems: 'center', border: '1px dashed var(--cx-border)', borderRadius: 9, color: 'var(--cx-text-muted)', textAlign: 'center' }}>
          <div><ImageIcon size={24} style={{ margin: '0 auto 8px', opacity: .65 }} /><div>Add series above to build the spotlight.</div></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((item, index) => {
            const series = seriesById.get(item.seriesId);
            return (
              <div key={item.seriesId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 14, padding: 12, border: '1px solid var(--cx-border)', borderRadius: 9, background: 'var(--cx-input-bg)' }}>
                <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: 13 }}>
                  <span style={{ display: 'grid', width: 30, height: 30, flex: 'none', placeItems: 'center', borderRadius: '50%', background: 'var(--cx-surface)', color: 'var(--cx-text)', fontSize: 12, fontWeight: 700 }}>{index + 1}</span>
                  <div style={{ display: 'grid', width: 96, height: 112, flex: 'none', placeItems: 'center', overflow: 'hidden', border: '1px dashed var(--cx-border)', borderRadius: 7, background: 'var(--cx-surface)' }}>
                    {item.image ? <img src={item.image} alt={`${series?.title ?? 'Series'} spotlight artwork`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <ImageIcon size={24} style={{ color: 'var(--cx-text-subtle)' }} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong style={{ display: 'block', overflow: 'hidden', color: 'var(--cx-text)', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{series?.title ?? 'Series no longer in catalog'}</strong>
                    <span style={{ display: 'block', marginTop: 4, color: 'var(--cx-text-muted)', fontSize: 12 }}>{series?.genres?.join(' · ') || series?.category || 'Genres follow the catalog'}</span>
                    <input ref={(node) => { fileInputsRef.current[item.seriesId] = node; }} type="file" accept="image/png,image/webp,.png,.webp" onChange={(event) => void updateImage(item.seriesId, event)} style={{ display: 'none' }} />
                    <button type="button" className="btn-dark" onClick={() => fileInputsRef.current[item.seriesId]?.click()} disabled={!series || uploadingSeriesId === item.seriesId} style={{ marginTop: 10, gap: 7, padding: '7px 10px' }}>
                      {uploadingSeriesId === item.seriesId ? <LoaderCircle className="spin-icon" size={14} /> : <Upload size={14} />}
                      {uploadingSeriesId === item.seriesId ? 'Uploading...' : item.image ? 'Replace artwork' : 'Upload artwork'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button type="button" className="btn-dark" aria-label={`Move ${series?.title ?? 'series'} up`} title="Move up" onClick={() => moveItem(index, -1)} disabled={index === 0} style={{ width: 34, height: 34, justifyContent: 'center', padding: 0 }}><ArrowUp size={15} /></button>
                  <button type="button" className="btn-dark" aria-label={`Move ${series?.title ?? 'series'} down`} title="Move down" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1} style={{ width: 34, height: 34, justifyContent: 'center', padding: 0 }}><ArrowDown size={15} /></button>
                  <button type="button" className="btn-icon-danger" aria-label={`Remove ${series?.title ?? 'series'}`} title="Remove series" onClick={() => { setItems(items.filter((entry) => entry.seriesId !== item.seriesId)); setSaveStatus(''); }} style={{ width: 34, height: 34 }}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
