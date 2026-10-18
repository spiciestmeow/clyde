import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  Edit2,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DEFAULT_HERO_SLIDES,
  getSiteSettings,
  saveSiteSettings,
  type HeroSlide,
  type SiteSettings,
} from '../lib/siteSettings';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';

export default function HeroSlidesManager({
  settings,
  onSave,
}: {
  settings?: SiteSettings | null;
  onSave?: (updated: SiteSettings) => void;
}) {
  const catalogQuery = useSeriesCatalog();
  const catalogItems = catalogQuery.items;

  const [slides, setSlides] = useState<HeroSlide[]>(() => {
    return settings?.heroSlides && settings.heroSlides.length > 0
      ? settings.heroSlides
      : [...DEFAULT_HERO_SLIDES];
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Form draft state
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSrc, setDraftSrc] = useState('');
  const [draftHref, setDraftHref] = useState('');
  const [seriesSearch, setSeriesSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Series search matches for auto-linking
  const searchMatches = useMemo(() => {
    if (!seriesSearch.trim()) return [];
    const term = seriesSearch.trim().toLowerCase();
    return catalogItems
      .filter((item) => item.title.toLowerCase().includes(term) || item.slug.toLowerCase().includes(term))
      .slice(0, 6);
  }, [catalogItems, seriesSearch]);

  const openAddModal = () => {
    setEditingIndex(null);
    setDraftTitle('');
    setDraftSrc('');
    setDraftHref('');
    setSeriesSearch('');
    setFormError('');
    setIsEditing(true);
  };

  const openEditModal = (index: number) => {
    const s = slides[index];
    setEditingIndex(index);
    setDraftTitle(s.title);
    setDraftSrc(s.src);
    setDraftHref(s.href);
    setSeriesSearch('');
    setFormError('');
    setIsEditing(true);
  };

  const handleSelectSeries = (item: typeof catalogItems[0]) => {
    setDraftTitle(item.title);
    setDraftHref(item.href || `/series/${item.slug}`);
    if (!draftSrc && item.cover) {
      setDraftSrc(item.cover);
    }
    setSeriesSearch('');
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, or WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setDraftSrc(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSlide = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!draftTitle.trim()) {
      setFormError('Slide title is required.');
      return;
    }
    if (!draftSrc.trim()) {
      setFormError('Please upload a banner image or paste an image URL.');
      return;
    }
    if (!draftHref.trim()) {
      setFormError('Series link is required (e.g. /series/my-title).');
      return;
    }

    const newSlide: HeroSlide = {
      id: editingIndex !== null ? slides[editingIndex].id : `hero-${Date.now()}`,
      title: draftTitle.trim(),
      src: draftSrc.trim(),
      href: draftHref.trim(),
    };

    let nextSlides: HeroSlide[];
    if (editingIndex !== null) {
      nextSlides = slides.map((s, idx) => (idx === editingIndex ? newSlide : s));
    } else {
      nextSlides = [...slides, newSlide];
    }

    setSlides(nextSlides);
    setIsEditing(false);
  };

  const handleDeleteSlide = (index: number) => {
    if (slides.length <= 1) {
      alert('You should have at least one hero slide on your homepage.');
      return;
    }
    if (confirm(`Remove "${slides[index].title}" from the hero slides?`)) {
      setSlides(slides.filter((_, idx) => idx !== index));
    }
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= slides.length) return;

    const copy = [...slides];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;
    setSlides(copy);
  };

  const persistAllSlides = async () => {
    setIsSaving(true);
    setSaveStatus('Saving to homepage...');

    try {
      const currentSettings = settings || (await getSiteSettings());
      const updatedSettings: SiteSettings = {
        ...currentSettings,
        heroSlides: slides,
      };

      const saved = await saveSiteSettings(updatedSettings);
      if (onSave) onSave(saved);
      setSaveStatus('Saved to homepage!');
      setTimeout(() => setSaveStatus(''), 4000);
    } catch {
      setSaveStatus('Failed to save. Check admin connection.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="comix-settings-card" style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cx-teal)', letterSpacing: '0.08em' }}>HOMEPAGE FEATURED</span>
          </div>
          <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--cx-text)' }}>
            Hero Banner Slides
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cx-text-muted)', maxWidth: 640 }}>
            Customize the big featured carousel on your homepage. Upload high-res images, auto-link to any series with search, or paste custom links.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" className="btn-teal" onClick={openAddModal}>
            <Plus size={16} /> Add new slide
          </button>
          <button
            type="button"
            className="btn-dark"
            onClick={persistAllSlides}
            disabled={isSaving}
            style={{ minWidth: 140 }}
          >
            {isSaving ? <LoaderCircle className="spin-icon" size={15} /> : <Check size={15} />}
            {isSaving ? 'Saving...' : 'Save to homepage'}
          </button>
        </div>
      </div>

      {saveStatus && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 6,
            marginBottom: 20,
            fontSize: 13,
            backgroundColor: saveStatus.includes('Failed') ? '#2d1616' : '#0e271e',
            border: `1px solid ${saveStatus.includes('Failed') ? '#7f1d1d' : '#165b40'}`,
            color: saveStatus.includes('Failed') ? '#f87171' : '#6ee7b7',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {saveStatus.includes('Failed') ? <AlertCircle size={16} /> : <Check size={16} />}
          <span>{saveStatus}</span>
        </div>
      )}

      {/* Slide list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {slides.map((slide, index) => (
          <div
            key={slide.id || index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: 14,
              backgroundColor: 'var(--cx-input-bg)',
              border: '1px solid var(--cx-border)',
              borderRadius: 8,
              flexWrap: 'wrap',
            }}
          >
            {/* Slide Index Badge */}
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: 'var(--cx-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--cx-text-muted)',
                flexShrink: 0,
              }}
            >
              #{index + 1}
            </div>

            {/* Banner Thumbnail Preview (16:9 ratio) */}
            <div
              style={{
                width: 140,
                height: 75,
                borderRadius: 6,
                overflow: 'hidden',
                backgroundColor: '#1f2732',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: '1px solid var(--cx-border)',
              }}
            >
              {slide.src ? (
                <img src={slide.src} alt={slide.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <ImageIcon size={20} style={{ color: 'var(--cx-text-subtle)' }} />
              )}
            </div>

            {/* Slide Details */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong style={{ display: 'block', fontSize: 15, color: 'var(--cx-text)', marginBottom: 4 }}>
                {slide.title}
              </strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--cx-teal)' }}>
                <span>{slide.href}</span>
                <a href={slide.href} target="_blank" rel="noreferrer" title="Test link">
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>

            {/* Order Controls */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                className="btn-dark"
                style={{ padding: '6px 10px', height: 32 }}
                onClick={() => handleMove(index, 'up')}
                disabled={index === 0}
                title="Move up"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                className="btn-dark"
                style={{ padding: '6px 10px', height: 32 }}
                onClick={() => handleMove(index, 'down')}
                disabled={index === slides.length - 1}
                title="Move down"
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                className="btn-dark"
                style={{ padding: '6px 12px', height: 32, gap: 6 }}
                onClick={() => openEditModal(index)}
              >
                <Edit2 size={13} /> Edit
              </button>
              <button
                type="button"
                className="btn-icon-danger"
                style={{ width: 32, height: 32 }}
                onClick={() => handleDeleteSlide(index)}
                title="Delete slide"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ========================================== */}
      {/* SLIDE ADD / EDIT MODAL DIALOG              */}
      {/* ========================================== */}
      {isEditing && (
        <div className="modal-backdrop" onClick={() => setIsEditing(false)}>
          <div
            className="modal-dialog-card"
            style={{ maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">
                {editingIndex !== null ? 'Edit Hero Slide' : 'Add Hero Slide'}
              </h2>
              <button type="button" className="modal-close-btn" onClick={() => setIsEditing(false)}>
                <X size={18} />
              </button>
            </div>
            <p className="modal-subtitle">
              Upload a banner and choose which series it links to.
            </p>

            <form onSubmit={handleSaveSlide}>
              {/* Feature 1: Series Search to Auto-Link */}
              <div style={{ marginBottom: 20, padding: 14, backgroundColor: 'var(--cx-input-bg)', borderRadius: 8, border: '1px solid var(--cx-border)' }}>
                <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Search size={14} style={{ color: 'var(--cx-teal)' }} />
                  <span>Auto-link from series catalog</span>
                </label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="Type to search series (e.g. Hero, Barbarian, Archmage)..."
                  value={seriesSearch}
                  onChange={(e) => setSeriesSearch(e.target.value)}
                />
                <p className="hint-text">
                  Selecting a series will automatically fill the title and link.
                </p>

                {searchMatches.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      border: '1px solid var(--cx-border)',
                      borderRadius: 6,
                      backgroundColor: 'var(--cx-surface)',
                      maxHeight: 180,
                      overflowY: 'auto',
                    }}
                  >
                    {searchMatches.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleSelectSeries(item)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--cx-border)',
                          transition: 'background-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--cx-active-item)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <div style={{ width: 26, height: 36, overflow: 'hidden', borderRadius: 3, backgroundColor: '#212933', flexShrink: 0 }}>
                          {item.cover ? <img src={item.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <BookOpen size={14} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ fontSize: 13, color: 'var(--cx-text)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.title}
                          </strong>
                          <small style={{ fontSize: 11, color: 'var(--cx-text-subtle)' }}>
                            /series/{item.slug}
                          </small>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--cx-teal)', fontWeight: 600 }}>Select</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Banner Image Upload & Preview */}
              <div className="field-group">
                <label className="field-label">Banner Image *</label>
                <div
                  style={{
                    width: '100%',
                    height: 180,
                    borderRadius: 8,
                    overflow: 'hidden',
                    backgroundColor: 'var(--cx-input-bg)',
                    border: '1px dashed var(--cx-border)',
                    marginBottom: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {draftSrc ? (
                    <img src={draftSrc} alt="Banner preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--cx-text-subtle)' }}>
                      <ImageIcon size={32} style={{ margin: '0 auto 6px', display: 'block' }} />
                      <span style={{ fontSize: 12 }}>Banner Preview (Recommended 1920×1080)</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".jpg,.jpeg,.png,.webp"
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="btn-dark"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ gap: 6 }}
                  >
                    <Upload size={14} /> Upload image file
                  </button>
                  {draftSrc && (
                    <button
                      type="button"
                      className="btn-text-danger"
                      onClick={() => setDraftSrc('')}
                    >
                      Clear image
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  className="text-input"
                  placeholder="Or paste direct image URL (https://...)"
                  value={draftSrc.startsWith('data:') ? 'Image uploaded from computer' : draftSrc}
                  onChange={(e) => setDraftSrc(e.target.value)}
                  disabled={draftSrc.startsWith('data:')}
                />
              </div>

              {/* Slide Title */}
              <div className="field-group">
                <label className="field-label">Slide Title *</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="e.g. The Hero's Ballad"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  required
                />
              </div>

              {/* Series Link */}
              <div className="field-group">
                <label className="field-label">Series Link *</label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="e.g. /series/the-hero's-ballad"
                  value={draftHref}
                  onChange={(e) => setDraftHref(e.target.value)}
                  required
                />
                <p className="hint-text">
                  Internal page (e.g. <code>/series/the-heros-ballad</code>) or external URL.
                </p>
              </div>

              {formError && (
                <div className="alert-banner alert-banner-error" style={{ marginBottom: 16 }}>
                  <AlertCircle size={15} />
                  <span>{formError}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button type="button" className="btn-cancel" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-teal">
                  {editingIndex !== null ? 'Save Changes' : 'Add Slide'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
