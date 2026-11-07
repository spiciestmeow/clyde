import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { CommentReactionKey, CommentReactor, CommentReactorList } from '../lib/comments';
import '../styles/comment-reactors.css';

export interface ReactionDef {
  key: CommentReactionKey;
  label: string;
  icon: string;
}

export interface ReactionGroup {
  def: ReactionDef;
  /** Readers who reacted with a name. */
  named: CommentReactor[];
  /** Readers who reacted without a name. */
  guests: number;
  total: number;
}

/** Groups reactors by reaction type, biggest group first. Empty groups are dropped. */
export function buildReactionGroups(list: CommentReactorList | undefined, defs: ReactionDef[]): ReactionGroup[] {
  if (!list) return [];
  const groups = defs
    .map((def) => {
      const named = list.named.filter((reactor) => reactor.reaction === def.key);
      const guests = list.guests[def.key] ?? 0;
      return { def, named, guests, total: named.length + guests };
    })
    .filter((group) => group.total > 0);
  groups.sort((a, b) => b.total - a.total);
  return groups;
}

const AVATAR_COLORS = ['#e2452b', '#ec4899', '#0d9488', '#22a33a', '#6366f1', '#f59e0b', '#0ea5e9', '#8b5cf6'];

function avatarColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "seiera, Rohit Malik and 27 others" / "Salman Osman and gunpark" / "1 guest" */
function describeGroup(group: ReactionGroup): string {
  if (group.named.length === 0) return plural(group.guests, 'guest', 'guests');
  const shown = group.named.slice(0, 2).map((reactor) => reactor.name);
  const rest = group.total - shown.length;
  if (rest === 0) return shown.join(' and ');
  return `${shown.join(', ')} and ${plural(rest, 'other', 'others')}`;
}

function PersonAvatar({ reactor, badge, className }: { reactor: CommentReactor; badge?: string; className: string }) {
  return (
    <span className={className}>
      <span className="reactors-avatar-face" style={reactor.avatar ? undefined : { background: avatarColor(reactor.name) }}>
        {reactor.avatar ? <img src={reactor.avatar} alt="" /> : reactor.name.slice(0, 1).toUpperCase()}
      </span>
      {badge && <img className="reactors-badge" src={badge} alt="" draggable={false} />}
    </span>
  );
}

function GuestAvatar({ badge, className }: { badge?: string; className: string }) {
  return (
    <span className={className}>
      <span className="reactors-avatar-face is-guest">?</span>
      {badge && <img className="reactors-badge" src={badge} alt="" draggable={false} />}
    </span>
  );
}

/** Small card shown when hovering / tapping the reaction summary under a comment. */
export function ReactorsPopover({
  groups,
  loading,
  onSeeAll,
}: {
  groups: ReactionGroup[];
  loading: boolean;
  onSeeAll: () => void;
}) {
  return (
    <div className="reactors-popover" role="dialog" aria-label="Who reacted">
      {groups.length === 0 ? (
        <p className="reactors-popover-empty">{loading ? 'Loading...' : 'No reactions yet'}</p>
      ) : (
        groups.map((group) => {
          const faces = group.named.slice(0, 3);
          return (
            <div className="reactors-popover-row" key={group.def.key}>
              <span className="reactors-avatars">
                {faces.length > 0 ? (
                  faces.map((reactor, index) => (
                    <PersonAvatar
                      key={reactor.id}
                      reactor={reactor}
                      className="reactors-avatar"
                      badge={index === faces.length - 1 ? group.def.icon : undefined}
                    />
                  ))
                ) : (
                  <GuestAvatar className="reactors-avatar" badge={group.def.icon} />
                )}
              </span>
              <span className="reactors-popover-text">{describeGroup(group)}</span>
            </div>
          );
        })
      )}
      <button type="button" className="reactors-see-all" onClick={onSeeAll}>
        See all reactions
      </button>
    </div>
  );
}

/** Full "Reactions" dialog: tabs per reaction, people grouped by reaction, guests rolled up. */
export function ReactionsModal({
  groups,
  loading,
  dark,
  onClose,
}: {
  groups: ReactionGroup[];
  loading: boolean;
  dark: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'all' | CommentReactionKey>('all');
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const activeTab = tab !== 'all' && !groups.some((group) => group.def.key === tab) ? 'all' : tab;
  const visible = activeTab === 'all' ? groups : groups.filter((group) => group.def.key === activeTab);

  return createPortal(
    <div
      className={`reactions-modal-backdrop${dark ? ' is-dark' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="reactions-modal" role="dialog" aria-modal="true" aria-labelledby="reactions-modal-title">
        <div className="reactions-modal-head">
          <h3 id="reactions-modal-title">Reactions</h3>
          <button ref={closeRef} type="button" className="reactions-modal-close" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="reactions-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            className={`reactions-tab${activeTab === 'all' ? ' is-active' : ''}`}
            onClick={() => setTab('all')}
          >
            All <span>{total}</span>
          </button>
          {groups.map((group) => (
            <button
              key={group.def.key}
              type="button"
              role="tab"
              aria-selected={activeTab === group.def.key}
              aria-label={`${group.def.label} ${group.total}`}
              className={`reactions-tab${activeTab === group.def.key ? ' is-active' : ''}`}
              onClick={() => setTab(group.def.key)}
            >
              <img src={group.def.icon} alt="" draggable={false} />
              <span>{group.total}</span>
            </button>
          ))}
        </div>

        <div className="reactions-modal-body">
          {groups.length === 0 && <p className="reactions-modal-empty">{loading ? 'Loading...' : 'No reactions yet'}</p>}
          {visible.map((group) => (
            <section key={group.def.key} className="reactions-section">
              {activeTab === 'all' && (
                <div className="reactions-section-title">
                  <img src={group.def.icon} alt="" draggable={false} />
                  <span>{group.def.label}</span>
                </div>
              )}
              {group.named.map((reactor) => (
                <div className="reactions-user" key={reactor.id}>
                  <PersonAvatar reactor={reactor} className="reactions-user-avatar" badge={group.def.icon} />
                  <div className="reactions-user-text">
                    <strong>{reactor.name}</strong>
                    <span>{reactor.handle}</span>
                  </div>
                </div>
              ))}
              {group.guests > 0 && (
                <div className="reactions-user is-guests">
                  <GuestAvatar className="reactions-user-avatar" />
                  <div className="reactions-user-text">
                    <strong>{plural(group.guests, 'guest', 'guests')}</strong>
                  </div>
                  <img className="reactions-guest-badge" src={group.def.icon} alt="" draggable={false} />
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
