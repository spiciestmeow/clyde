import { useRef, useState, type CSSProperties, type ChangeEvent, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Image as ImageIcon,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { compressImageFile } from '../lib/imageUpload';
import {
  DEFAULT_SUPPORT_METHODS,
  type SupportMethod,
  type SupportMethodKind,
} from '../lib/siteSettings';

type Props = {
  methods: SupportMethod[];
  saving: boolean;
  /** Persists the full, new list (order = order shown on /donate). */
  onSave: (next: SupportMethod[]) => void | Promise<void>;
};

type FormState = {
  name: string;
  detail: string;
  kind: SupportMethodKind;
  addressOrUrl: string;
  iconUrl: string;
  color: string;
  instructions: string;
  network: string;
  accountName: string;
  valueLabel: string;
  enabled: boolean;
};

type FormErrors = { name?: string; address?: string; icon?: string };

const DEFAULT_COLOR = '#dc2626';
const HEX_RE = /^#[0-9a-f]{6}$/i;

const EMPTY_FORM: FormState = {
  name: '',
  detail: '',
  kind: 'link',
  addressOrUrl: '',
  iconUrl: '',
  color: DEFAULT_COLOR,
  instructions: '',
  network: '',
  accountName: '',
  valueLabel: '',
  enabled: true,
};

function formFromMethod(m: SupportMethod): FormState {
  return {
    name: m.name,
    detail: m.detail,
    kind: m.kind,
    addressOrUrl: m.addressOrUrl,
    iconUrl: m.iconUrl,
    color: m.color,
    instructions: m.instructions ?? '',
    network: m.network ?? '',
    accountName: m.accountName ?? '',
    valueLabel: m.valueLabel ?? '',
    enabled: m.enabled,
  };
}

/** Accepts http(s) links; bare domains get https://; rejects javascript:, data:, etc. */
function normalizeLink(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  return `https://${value}`;
}

const ellipsis: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function MethodIcon({ src, name, color, size }: { src: string; name: string; color: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span style={{ fontWeight: 800, color, fontSize: Math.round(size * 0.7), lineHeight: 1 }}>
        {(name.trim()[0] || '?').toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
      onError={() => setFailed(true)}
    />
  );
}

function KindBadge({ kind }: { kind: SupportMethodKind }) {
  const isLink = kind === 'link';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        background: isLink ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
        color: isLink ? '#3b82f6' : '#10b981',
        flex: '0 0 auto',
      }}
    >
      {isLink ? <Link2 size={11} /> : <Wallet size={11} />}
      {isLink ? 'Opens link' : 'Copy popup'}
    </span>
  );
}

function ConfirmModal({
  title,
  children,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="supporter-modal-backdrop" style={{ zIndex: 10001 }} onClick={onCancel}>
      <div className="supporter-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: 'center', padding: '6px 0 16px' }}>
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}
          >
            <Trash2 size={24} />
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: 'var(--cx-text)' }}>{title}</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--cx-text-muted)', lineHeight: 1.45 }}>{children}</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={busy}
            style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 18px',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {busy ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SupportMethodsManager({ methods, saving, onSave }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<SupportMethod | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openNew = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setEditingId('new');
  };

  const openEdit = (method: SupportMethod) => {
    setForm(formFromMethod(method));
    setErrors({});
    setEditingId(method.id);
  };

  const closeModal = () => {
    setEditingId(null);
    setErrors({});
  };

  const handleIconFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, icon: 'Please choose an image file.' }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, icon: 'Image is too large (max 5 MB).' }));
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await compressImageFile(file, 128, 128, 0.92);
      set('iconUrl', dataUrl);
      setErrors((prev) => ({ ...prev, icon: undefined }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        icon: err instanceof Error ? err.message : 'Failed to process the image.',
      }));
    } finally {
      setUploading(false);
    }
  };

  const handleSaveForm = () => {
    const nextErrors: FormErrors = {};
    const name = form.name.trim();
    if (!name) nextErrors.name = 'Name is required.';

    let address = form.addressOrUrl.trim();
    if (form.kind === 'link') {
      const normalized = normalizeLink(address);
      if (!normalized) {
        nextErrors.address = address ? 'Link must start with https://' : 'Link URL is required.';
      } else {
        address = normalized;
      }
    } else if (!address) {
      nextErrors.address = 'Address / account number is required.';
    }

    const icon = form.iconUrl.trim();
    if (icon && !/^(https?:\/\/|\/|data:image\/)/i.test(icon)) {
      nextErrors.icon = 'Icon must be an https:// image URL or an uploaded image.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const isDetails = form.kind === 'details';
    const entry: SupportMethod = {
      id: editingId === 'new' || !editingId ? `method_${Date.now()}` : editingId,
      name,
      detail: form.detail.trim(),
      kind: form.kind,
      addressOrUrl: address,
      iconUrl: icon,
      color: HEX_RE.test(form.color) ? form.color : DEFAULT_COLOR,
      instructions: isDetails ? form.instructions.trim() || undefined : undefined,
      network: isDetails ? form.network.trim() || undefined : undefined,
      accountName: isDetails ? form.accountName.trim() || undefined : undefined,
      valueLabel: isDetails ? form.valueLabel.trim() || undefined : undefined,
      enabled: form.enabled,
    };

    const next =
      editingId === 'new'
        ? [...methods, entry]
        : methods.map((m) => (m.id === entry.id ? entry : m));

    void onSave(next);
    closeModal();
  };

  const toggleEnabled = (id: string) => {
    void onSave(methods.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= methods.length) return;
    const next = [...methods];
    [next[index], next[target]] = [next[target], next[index]];
    void onSave(next);
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    void onSave(methods.filter((m) => m.id !== toDelete.id));
    setToDelete(null);
  };

  const confirmResetDefaults = () => {
    void onSave(DEFAULT_SUPPORT_METHODS.map((m) => ({ ...m })));
    setConfirmReset(false);
  };

  const enabledCount = methods.filter((m) => m.enabled).length;
  const colorForPicker = HEX_RE.test(form.color) ? form.color : DEFAULT_COLOR;
  const previewColor = colorForPicker;
  const isDetailsForm = form.kind === 'details';
  const uploadedIcon = form.iconUrl.startsWith('data:');

  return (
    <>
      <div className="comix-settings-card">
        <div className="comix-setting-group">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <div className="comix-group-title" style={{ marginBottom: 4 }}>Support Methods Manager</div>
              <p className="comix-theme-description" style={{ margin: 0 }}>
                Add and customize the payment options shown in the &ldquo;Support method&rdquo; section of the /donate page.
                Cards appear in the order listed below.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 13, borderRadius: 8, cursor: 'pointer' }}
                onClick={() => setConfirmReset(true)}
                disabled={saving}
                title="Replace all methods with the original defaults"
              >
                <RotateCcw size={14} />
                <span>Reset to Defaults</span>
              </button>
              <button
                type="button"
                className="btn-teal"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, borderRadius: 8, cursor: 'pointer' }}
                onClick={openNew}
                disabled={saving}
              >
                <Plus size={16} />
                <span>Add Method</span>
              </button>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--cx-text-muted)', marginBottom: 14 }}>
            <strong style={{ color: 'var(--cx-text)' }}>{enabledCount}</strong> of {methods.length} method
            {methods.length === 1 ? '' : 's'} visible on /donate
          </div>

          {methods.length === 0 ? (
            <div className="comix-new-series-empty">
              No support methods yet. Click <strong>Add Method</strong> to create one, or{' '}
              <strong>Reset to Defaults</strong> to restore the original list.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {methods.map((m, index) => (
                <div
                  key={m.id}
                  style={{
                    background: 'var(--cx-surface)',
                    border: '1px solid var(--cx-border)',
                    borderRadius: 12,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: m.enabled ? 1 : 0.55 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        flex: '0 0 44px',
                        borderRadius: 10,
                        background: `${m.color}1f`,
                        display: 'grid',
                        placeItems: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      <MethodIcon key={m.iconUrl} src={m.iconUrl} name={m.name} color={m.color} size={26} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ ...ellipsis, fontWeight: 700, fontSize: 14, color: 'var(--cx-text)' }}>{m.name}</div>
                      <div style={{ ...ellipsis, fontSize: 12, color: 'var(--cx-text-muted)' }}>
                        {m.detail || 'No description'}
                      </div>
                    </div>
                    <span
                      title={m.color}
                      style={{ width: 12, height: 12, borderRadius: '50%', background: m.color, flex: '0 0 12px', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, opacity: m.enabled ? 1 : 0.55 }}>
                    <KindBadge kind={m.kind} />
                    <span style={{ ...ellipsis, flex: 1, minWidth: 0, fontSize: 11, color: 'var(--cx-text-subtle)' }} title={m.addressOrUrl}>
                      {m.addressOrUrl}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      borderTop: '1px solid var(--cx-border)',
                      paddingTop: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={m.enabled}
                        aria-label={`${m.enabled ? 'Hide' : 'Show'} ${m.name} on the donate page`}
                        className={`comix-switch ${m.enabled ? 'is-active' : ''}`}
                        onClick={() => toggleEnabled(m.id)}
                        disabled={saving}
                      >
                        <span className="comix-switch-knob" />
                      </button>
                      <span style={{ fontSize: 12, color: 'var(--cx-text-muted)' }}>{m.enabled ? 'Visible' : 'Hidden'}</span>
                    </div>
                    <div className="comix-new-series-controls">
                      <button type="button" title="Move up" aria-label={`Move ${m.name} up`} disabled={saving || index === 0} onClick={() => move(index, -1)}>
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" title="Move down" aria-label={`Move ${m.name} down`} disabled={saving || index === methods.length - 1} onClick={() => move(index, 1)}>
                        <ArrowDown size={14} />
                      </button>
                      <button type="button" title="Edit method" aria-label={`Edit ${m.name}`} disabled={saving} onClick={() => openEdit(m)}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" title="Delete method" aria-label={`Delete ${m.name}`} disabled={saving} onClick={() => setToDelete(m)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit modal */}
      {editingId && (
        <div className="supporter-modal-backdrop" onClick={closeModal}>
          <div className="supporter-modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="supporter-modal-header">
              <h3>{editingId === 'new' ? 'Add Support Method' : 'Edit Support Method'}</h3>
              <button type="button" className="supporter-modal-close" onClick={closeModal} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            {/* Live preview — mirrors the card on /donate */}
            <div
              className="supporter-preview-box"
              style={{ borderColor: `${previewColor}33`, opacity: form.enabled ? 1 : 0.6 }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  flex: '0 0 42px',
                  borderRadius: 10,
                  background: `${previewColor}14`,
                  display: 'grid',
                  placeItems: 'center',
                  overflow: 'hidden',
                }}
              >
                <MethodIcon key={form.iconUrl} src={form.iconUrl} name={form.name || '?'} color={previewColor} size={24} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ ...ellipsis, fontWeight: 700, fontSize: 14, color: 'var(--cx-text)' }}>
                  {form.name.trim() || 'Method name'}
                </div>
                <div style={{ ...ellipsis, fontSize: 12, color: 'var(--cx-text-muted)' }}>
                  {form.detail.trim() || 'Short description'}
                </div>
              </div>
              <KindBadge kind={form.kind} />
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="supporter-modal-label-sm">
                    Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="supporter-modal-input"
                    placeholder="e.g. PayPal"
                    maxLength={40}
                    value={form.name}
                    onChange={(e) => {
                      set('name', e.target.value);
                      if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                  />
                  {errors.name && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{errors.name}</div>}
                </div>
                <div>
                  <label className="supporter-modal-label-sm">Description</label>
                  <input
                    type="text"
                    className="supporter-modal-input"
                    placeholder="e.g. Send via PayPal"
                    maxLength={80}
                    value={form.detail}
                    onChange={(e) => set('detail', e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="supporter-modal-label-sm">What happens when someone clicks the card?</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    className={`supporter-time-mode-btn ${form.kind === 'link' ? 'is-active' : ''}`}
                    onClick={() => {
                      set('kind', 'link');
                      setErrors((prev) => ({ ...prev, address: undefined }));
                    }}
                  >
                    <Link2 size={14} />
                    <span>Open a link</span>
                  </button>
                  <button
                    type="button"
                    className={`supporter-time-mode-btn ${form.kind === 'details' ? 'is-active' : ''}`}
                    onClick={() => {
                      set('kind', 'details');
                      setErrors((prev) => ({ ...prev, address: undefined }));
                    }}
                  >
                    <Wallet size={14} />
                    <span>Show details + copy</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="supporter-modal-label-sm">
                  {isDetailsForm ? 'Address / Account / Number' : 'Link URL'} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="supporter-modal-input"
                  placeholder={isDetailsForm ? 'Wallet address, phone number or account ID' : 'https://paypal.me/yourname'}
                  value={form.addressOrUrl}
                  onChange={(e) => {
                    set('addressOrUrl', e.target.value);
                    if (errors.address) setErrors((prev) => ({ ...prev, address: undefined }));
                  }}
                />
                {errors.address && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{errors.address}</div>}
              </div>

              {isDetailsForm && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="supporter-modal-label-sm">Field label (optional)</label>
                      <input
                        type="text"
                        className="supporter-modal-input"
                        placeholder="Address / Account ID"
                        maxLength={40}
                        value={form.valueLabel}
                        onChange={(e) => set('valueLabel', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="supporter-modal-label-sm">Account name (optional)</label>
                      <input
                        type="text"
                        className="supporter-modal-input"
                        placeholder="Shown above the number"
                        maxLength={60}
                        value={form.accountName}
                        onChange={(e) => set('accountName', e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="supporter-modal-label-sm">Network (optional)</label>
                    <input
                      type="text"
                      className="supporter-modal-input"
                      placeholder="e.g. TRON (TRC20 ONLY)"
                      maxLength={80}
                      value={form.network}
                      onChange={(e) => set('network', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="supporter-modal-label-sm">Instructions (optional)</label>
                    <textarea
                      className="supporter-modal-input"
                      rows={3}
                      placeholder="Shown at the top of the popup"
                      maxLength={400}
                      style={{ resize: 'vertical', fontFamily: 'inherit' }}
                      value={form.instructions}
                      onChange={(e) => set('instructions', e.target.value)}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="supporter-modal-label-sm">Icon</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    className="supporter-modal-input"
                    placeholder="https://… image URL, or upload one"
                    readOnly={uploadedIcon}
                    value={uploadedIcon ? '(uploaded image)' : form.iconUrl}
                    onChange={(e) => {
                      set('iconUrl', e.target.value);
                      if (errors.icon) setErrors((prev) => ({ ...prev, icon: undefined }));
                    }}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void handleIconFile(e)} />
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 13, borderRadius: 8, cursor: 'pointer', flex: '0 0 auto' }}
                  >
                    {uploading ? <ImageIcon size={14} /> : <Upload size={14} />}
                    <span>{uploading ? 'Processing…' : 'Upload'}</span>
                  </button>
                  {form.iconUrl && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => set('iconUrl', '')}
                      title="Remove icon"
                      aria-label="Remove icon"
                      style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', flex: '0 0 auto' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {errors.icon && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>{errors.icon}</div>}
                <div style={{ fontSize: 11, color: 'var(--cx-text-subtle)', marginTop: 4 }}>
                  Square images work best. Uploads are resized to 128&times;128. Without an icon, the first letter of the name is used.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
                <div>
                  <label className="supporter-modal-label-sm">Accent color</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={colorForPicker}
                      onChange={(e) => set('color', e.target.value)}
                      aria-label="Accent color"
                      style={{ width: 42, height: 36, padding: 2, border: '1px solid var(--cx-border)', borderRadius: 8, background: 'var(--cx-surface)', cursor: 'pointer', flex: '0 0 auto' }}
                    />
                    <input
                      type="text"
                      className="supporter-modal-input"
                      value={form.color}
                      maxLength={7}
                      onChange={(e) => set('color', e.target.value)}
                      placeholder="#dc2626"
                      style={{ minWidth: 0 }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 6 }}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.enabled}
                    aria-label="Visible on donate page"
                    className={`comix-switch ${form.enabled ? 'is-active' : ''}`}
                    onClick={() => set('enabled', !form.enabled)}
                  >
                    <span className="comix-switch-knob" />
                  </button>
                  <span style={{ fontSize: 13, color: 'var(--cx-text)' }}>Visible on /donate</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeModal}
                disabled={saving}
                style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-teal"
                onClick={handleSaveForm}
                disabled={saving || uploading}
                style={{ padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
              >
                {saving ? 'Saving...' : editingId === 'new' ? 'Add Method' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <ConfirmModal
          title="Delete Support Method"
          confirmLabel="Delete Method"
          busy={saving}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        >
          Are you sure you want to permanently delete{' '}
          <strong style={{ color: 'var(--cx-text)' }}>{toDelete.name}</strong>? It will disappear from the /donate page.
        </ConfirmModal>
      )}

      {confirmReset && (
        <ConfirmModal
          title="Reset to Defaults"
          confirmLabel="Reset Methods"
          busy={saving}
          onCancel={() => setConfirmReset(false)}
          onConfirm={confirmResetDefaults}
        >
          This replaces <strong style={{ color: 'var(--cx-text)' }}>all {methods.length}</strong> current methods with the
          original defaults. Any custom methods will be lost.
        </ConfirmModal>
      )}
    </>
  );
}
