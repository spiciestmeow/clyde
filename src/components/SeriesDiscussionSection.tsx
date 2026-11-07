import React, { useEffect, useState, useRef } from 'react';
import {
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Pin,
  Trash2,
  RotateCw,
  RotateCcw,
  Eye,
  Send,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link2,
  Quote,
  Image as ImageIcon,
  Smile,
  AtSign,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  ShieldAlert,
  Flame,
  Clock,
  Hourglass,
  MoreHorizontal,
  Info,
  UserPlus,
  Ban,
  Pencil,
  Flag,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  fetchSeriesComments,
  reportSeriesComment,
  addSeriesComment,
  voteSeriesComment,
  deleteSeriesComment,
  editSeriesComment,
  type SeriesComment,
} from '../lib/comments';
import { ComposerBox } from './ComposerBox';
import '../styles/series-discussion.css';
import '../styles/comment-votes.css';

interface SeriesDiscussionProps {
  seriesSlug: string;
  seriesTitle?: string;
  isAdminPreview?: boolean;
}

const QUICK_EMOJIS = ['😊', '🔥', '❤️', '👍', '😂', '😭', '💀', '🎉', '✨', '👀'];

/** Replies shown under a comment before "Show more replies (n)" appears. */
const REPLY_PREVIEW_COUNT = 3;

/** localStorage key for commenters this reader has blocked on this device. */
const BLOCKED_USERS_KEY = 'clydee_blocked_comment_users';

/** localStorage key for commenters this reader added as friends on this device. */
const FRIENDS_KEY = 'clydee_comment_friends';

/** The reader's current vote on a comment: 1 (up), -1 (down) or 0 (none). */
function getMyVote(item: SeriesComment): 1 | -1 | 0 {
  return item.user_vote === 1 || item.user_vote === -1 ? item.user_vote : 0;
}

export function SeriesDiscussionSection({ seriesSlug, seriesTitle, isAdminPreview }: SeriesDiscussionProps) {
  const [comments, setComments] = useState<SeriesComment[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<'best' | 'newest' | 'oldest'>('best');

  // User state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('clydee_guest_nickname') || 'Reader';
    }
    return 'Reader';
  });
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<'Admin' | 'Scanlator' | 'VIP' | 'Reader'>('Reader');
  const [isAdmin, setIsAdmin] = useState(false);

  // Composer state
  const [content, setContent] = useState('');
  const [history, setHistory] = useState<string[]>(['']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [posting, setPosting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Collapsed replies state (key: parent comment id, value: boolean isExpanded)
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  // "Show more replies" state (key: parent comment id, value: show every reply)
  const [showAllReplies, setShowAllReplies] = useState<Record<string, boolean>>({});

  // Inline reply composer state
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyTargetName, setReplyTargetName] = useState<string>('');
  const [replyContent, setReplyContent] = useState('');
  const [replyPosting, setReplyPosting] = useState(false);

  // Revealed spoilers
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());

  // Vote that is currently being saved (shows a loading circle on that button)
  const [voting, setVoting] = useState<{ id: string; dir: 1 | -1 } | null>(null);

  // Inline comment editing (author's own comments)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Comment "..." menu (copy link / block user / report)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuNotice, setMenuNotice] = useState<{ id: string; action: 'copy' | 'report' | 'friend' } | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(BLOCKED_USERS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : [];
    } catch {
      return [];
    }
  });

  const persistBlockedUsers = (next: string[]) => {
    setBlockedUsers(next);
    try {
      localStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable: the block lasts until the page is closed
    }
  };

  /** Shows a short confirmation inside the menu item, then closes the menu. */
  const flashMenuNotice = (id: string, action: 'copy' | 'report' | 'friend') => {
    setMenuNotice({ id, action });
    window.setTimeout(() => {
      setMenuNotice((current) => (current?.id === id ? null : current));
      setMenuOpenId((current) => (current === id ? null : current));
    }, 1400);
  };

  const handleCopyLink = async (comment: SeriesComment) => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#comment-${comment.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard blocked (e.g. insecure page): let the reader copy it by hand
      setMenuOpenId(null);
      window.prompt('Copy this comment link:', url);
      return;
    }
    flashMenuNotice(comment.id, 'copy');
  };

  const handleBlockUser = (comment: SeriesComment) => {
    setMenuOpenId(null);
    const name = comment.user_name;
    if (!window.confirm(`Block ${name}? Their comments will be hidden for you on this device.`)) return;
    if (!blockedUsers.includes(name)) persistBlockedUsers([...blockedUsers, name]);
  };

  const handleReport = async (comment: SeriesComment) => {
    const reason = window.prompt('Why are you reporting this comment? (optional)', '');
    if (reason === null) return;
    await reportSeriesComment(comment.id, seriesSlug, reason.trim());
    flashMenuNotice(comment.id, 'report');
  };

  /** Quick profile summary for a commenter (logged-in readers only). */
  const handleInfo = (comment: SeriesComment) => {
    setMenuOpenId(null);
    window.alert(
      `${comment.user_name}\nLevel ${getLevel(comment)} · ${comment.user_role}\nCommented ${formatTime(comment.created_at)}`,
    );
  };

  /** Saves the commenter to this device's friend list (no server friends system yet). */
  const handleAddFriend = (comment: SeriesComment) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(FRIENDS_KEY) || '[]');
      const list: string[] = Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [];
      if (!list.includes(comment.user_name)) {
        localStorage.setItem(FRIENDS_KEY, JSON.stringify([...list, comment.user_name]));
      }
    } catch {
      // storage unavailable: nothing to persist
    }
    flashMenuNotice(comment.id, 'friend');
  };

  // Close the comment "..." menu on outside tap or Escape
  useEffect(() => {
    if (!menuOpenId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.comment-menu-wrap')) setMenuOpenId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpenId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpenId]);

  // Check auth user & session
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setCurrentUserId(session.user.id);
        const meta = session.user.user_metadata || {};
        const name = meta.full_name || meta.name || meta.username || session.user.email?.split('@')[0] || 'Admin';
        setCurrentUserName(name);
        setCurrentUserAvatar(meta.avatar_url || null);
        const role = meta.role || (session.user.email ? 'Admin' : 'Reader');
        setCurrentUserRole(role === 'Admin' ? 'Admin' : role === 'Scanlator' ? 'Scanlator' : 'Reader');
        setIsAdmin(true);
      }
    });
  }, []);

  // Load comments
  const loadComments = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { comments: list, totalCount: count } = await fetchSeriesComments(seriesSlug, sort, 'all');
      setComments(list);
      setTotalCount(count);

      // Default expand first thread's replies
      setExpandedReplies((prev) => {
        const next = { ...prev };
        for (const c of list) {
          if (c.replies && c.replies.length > 0 && next[c.id] === undefined) {
            next[c.id] = true;
          }
        }
        return next;
      });
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadComments();
  }, [seriesSlug, sort]);

  // A copied comment link (#comment-<id>) scrolls to that comment once the list has loaded
  useEffect(() => {
    if (loading) return;
    const hash = window.location.hash;
    if (!hash.startsWith('#comment-')) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'center' });
  }, [loading]);

  const handleRefresh = () => {
    setRefreshing(true);
    void loadComments(true);
  };

  // Textarea undo/redo tracker
  const handleContentChange = (val: string) => {
    setContent(val);
    const updated = history.slice(0, historyIndex + 1);
    updated.push(val);
    setHistory(updated);
    setHistoryIndex(updated.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = historyIndex - 1;
      setHistoryIndex(prev);
      setContent(history[prev]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = historyIndex + 1;
      setHistoryIndex(next);
      setContent(history[next]);
    }
  };

  // Formatting insert helpers
  const wrapText = (before: string, after: string, defaultPlaceholder = '') => {
    const el = textareaRef.current;
    if (!el) {
      handleContentChange(content + before + defaultPlaceholder + after);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.substring(start, end) || defaultPlaceholder;
    const nextVal = content.substring(0, start) + before + selected + after + content.substring(end);
    handleContentChange(nextVal);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (!el) {
      handleContentChange(content + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const nextVal = content.substring(0, start) + text + content.substring(end);
    handleContentChange(nextVal);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  // Submit top-level comment
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || posting) return;

    setPosting(true);
    const authorName = currentUserName.trim() || 'Reader';
    try {
      await addSeriesComment({
        seriesSlug,
        content,
        userName: authorName,
        userAvatar: currentUserAvatar || undefined,
        userRole: currentUserRole,
        userId: currentUserId || undefined,
        level: isAdmin ? 99 : 1,
      });

      setContent('');
      setShowEmojiPicker(false);
      void loadComments(true);
    } catch {
      // ignore
    } finally {
      setPosting(false);
    }
  };

  // Submit reply
  const handleSubmitReply = async (parentId: string, replyingToUser: string) => {
    if (!replyContent.trim() || replyPosting) return;

    setReplyPosting(true);
    const authorName = currentUserName.trim() || 'Reader';
    try {
      await addSeriesComment({
        seriesSlug,
        content: replyContent,
        userName: authorName,
        userAvatar: currentUserAvatar || undefined,
        userRole: currentUserRole,
        userId: currentUserId || undefined,
        parentId,
        replyToName: replyingToUser,
        level: isAdmin ? 99 : 1,
      });

      setReplyContent('');
      setReplyingToId(null);
      setExpandedReplies((prev) => ({ ...prev, [parentId]: true }));
      setShowAllReplies((prev) => ({ ...prev, [parentId]: true }));
      void loadComments(true);
    } catch {
      // ignore
    } finally {
      setReplyPosting(false);
    }
  };

  // Upvote / downvote (tapping your current vote again removes it)
  const handleVote = async (comment: SeriesComment, next: 1 | -1) => {
    if (voting?.id === comment.id) return; // already saving a vote on this comment
    const current = getMyVote(comment);
    const target: 1 | -1 | 0 = current === next ? 0 : next;

    const updateInTree = (list: SeriesComment[]): SeriesComment[] =>
      list.map((c) => {
        if (c.id === comment.id) {
          let upvotes = c.upvotes;
          let downvotes = c.downvotes;
          if (current === 1) upvotes = Math.max(0, upvotes - 1);
          if (current === -1) downvotes = Math.max(0, downvotes - 1);
          if (target === 1) upvotes += 1;
          if (target === -1) downvotes += 1;
          return { ...c, upvotes, downvotes, user_vote: target };
        }
        if (c.replies && c.replies.length > 0) {
          return { ...c, replies: updateInTree(c.replies) };
        }
        return c;
      });

    // Optimistic update, then persist (spinner stays at least 400ms so it is visible)
    setComments((prev) => updateInTree(prev));
    setVoting({ id: comment.id, dir: next });
    try {
      await Promise.all([
        voteSeriesComment(comment.id, seriesSlug, current, next),
        new Promise((resolve) => window.setTimeout(resolve, 400)),
      ]);
    } catch {
      // ignore
    } finally {
      setVoting((now) => (now?.id === comment.id ? null : now));
    }
  };

  // Delete
  const handleDelete = async (commentId: string) => {
    if (!window.confirm('Delete this comment?')) return;
    await deleteSeriesComment(commentId, seriesSlug);
    void loadComments(true);
  };

  // Edit your own comment
  const handleStartEdit = (comment: SeriesComment) => {
    setMenuOpenId(null);
    setReplyingToId(null);
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const handleSaveEdit = async (comment: SeriesComment) => {
    const text = editContent.trim();
    if (!text || editSaving) return;
    setEditSaving(true);

    const updateInTree = (list: SeriesComment[]): SeriesComment[] =>
      list.map((c) => {
        if (c.id === comment.id) return { ...c, content: text };
        if (c.replies && c.replies.length > 0) return { ...c, replies: updateInTree(c.replies) };
        return c;
      });

    try {
      await editSeriesComment(comment.id, seriesSlug, text);
      setComments((prev) => updateInTree(prev));
      setEditingId(null);
      setEditContent('');
    } catch {
      // ignore
    } finally {
      setEditSaving(false);
    }
  };

  // Spoiler toggle
  const toggleSpoiler = (id: string) => {
    setRevealedSpoilers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle replies accordion
  const toggleRepliesAccordion = (id: string) => {
    setExpandedReplies((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Toggle "show more replies"
  const toggleShowAllReplies = (id: string) => {
    setShowAllReplies((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Relative time helper
  const formatTime = (isoString: string): string => {
    const parsed = Date.parse(isoString);
    if (Number.isNaN(parsed)) return 'recently';
    const diffMin = Math.floor((Date.now() - parsed) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.max(1, Math.round(diffHours / 24));
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    const diffWeeks = Math.max(1, Math.round(diffDays / 7));
    if (diffWeeks < 5) return `${diffWeeks}w ago`;
    const diffMonths = Math.max(1, Math.round(diffDays / 30));
    return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  };

  // Level badge generator
  const getLevel = (comment: SeriesComment): number => {
    if (typeof comment.level === 'number') return comment.level;
    if (comment.user_role === 'Admin') return 99;
    if (comment.user_role === 'Reading Legend') return 74;
    if (comment.user_role === 'Scanlator') return 50;
    let hash = 0;
    const str = comment.user_name || comment.id;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
    }
    return (Math.abs(hash) % 15) + 1;
  };

  // Render a comment node
  const renderComment = (item: SeriesComment, isChild = false, parentId?: string) => {
    // Commenters this reader blocked are hidden (their thread included)
    if (blockedUsers.includes(item.user_name)) return null;
    const isRevealed = revealedSpoilers.has(item.id);
    const isRepliesExpanded = expandedReplies[item.id] !== false;
    const replyList = (item.replies ?? []).filter((reply) => !blockedUsers.includes(reply.user_name));
    const hasReplies = replyList.length > 0;
    const myVote = getMyVote(item);
    const votingDir = voting?.id === item.id ? voting.dir : null;
    const isOwnComment = Boolean(currentUserId && item.user_id === currentUserId);

    // Replies preview ("Show more replies (n)")
    const showAll = Boolean(showAllReplies[item.id]);
    const visibleReplies = showAll ? replyList : replyList.slice(0, REPLY_PREVIEW_COUNT);
    const hiddenReplyCount = replyList.length - REPLY_PREVIEW_COUNT;

    const showThreadLine = !isChild && hasReplies && isRepliesExpanded;

    return (
      <div
        key={item.id}
        id={`comment-${item.id}`}
        className={`comment-item${isChild ? ' comment-item--reply' : ' comment-item--root'}`}
      >
        {/* Left column: avatar + vertical thread line */}
        <div className="comment-avatar-col">
          <div className="comment-avatar">
            {item.user_avatar ? (
              <img src={item.user_avatar} alt="" />
            ) : (
              (item.user_name || 'R').slice(0, 1).toUpperCase()
            )}
          </div>
          {showThreadLine && <span className="comment-thread-line" aria-hidden="true" />}
        </div>

        {/* Right Main Column */}
        <div className="comment-main">
          {/* Header row */}
          <div className="comment-header">
            <span className="comment-author-name">{item.user_name}</span>

            {item.is_pinned && (
              <span className="comment-pinned-tag">
                <Pin size={7} /> Pinned
              </span>
            )}

            <span className="comment-dot">·</span>
            <span className="comment-time">{formatTime(item.created_at)}</span>
          </div>

          {/* Replying mention tag if child comment */}
          {item.reply_to_name && (
            <div className="comment-replying-ref">
              <CornerDownRight size={7.5} />
              <span>replying to</span>
              <span className="comment-replying-tag">@{item.reply_to_name}</span>
            </div>
          )}

          {/* Comment text body (or the inline editor, or a spoiler mask) */}
          {editingId === item.id ? (
            <div className="comment-inline-edit">
              <ComposerBox
                value={editContent}
                onChange={setEditContent}
                placeholder="Edit your comment..."
                maxLength={5000}
                autoFocus
              />
              <div className="composer-action-row">
                <button
                  type="button"
                  className="composer-cancel-btn"
                  onClick={() => {
                    setEditingId(null);
                    setEditContent('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`composer-post-btn${editContent.trim() ? ' has-content' : ''}`}
                  onClick={() => void handleSaveEdit(item)}
                  disabled={!editContent.trim() || editSaving}
                >
                  <span>{editSaving ? 'Saving...' : 'Save'}</span>
                </button>
              </div>
            </div>
          ) : item.is_spoiler && !isRevealed ? (
            <div
              className="comment-spoiler-mask"
              onClick={() => toggleSpoiler(item.id)}
              role="button"
              tabIndex={0}
            >
              <p className="comment-text comment-spoiler-blur">{item.content}</p>
              <div className="comment-spoiler-overlay">
                <Eye size={9} /> Spoiler
              </div>
            </div>
          ) : (
            <p className="comment-text">{item.content}</p>
          )}

          {/* Action Row */}
          <div className="comment-actions">
            {/* Upvote / downvote, each with its own count */}
            <button
              type="button"
              className={`action-vote-btn action-vote-btn--up${myVote === 1 ? ' is-active' : ''}`}
              onClick={() => void handleVote(item, 1)}
              aria-label="Upvote"
              aria-pressed={myVote === 1}
              aria-busy={votingDir === 1}
              disabled={votingDir !== null}
            >
              {votingDir === 1 ? (
                <Loader2 size={9.5} className="is-spinning" />
              ) : (
                <ThumbsUp size={9.5} fill={myVote === 1 ? 'currentColor' : 'none'} />
              )}
              <span>{item.upvotes}</span>
            </button>
            <button
              type="button"
              className={`action-vote-btn action-vote-btn--down${myVote === -1 ? ' is-active' : ''}`}
              onClick={() => void handleVote(item, -1)}
              aria-label="Downvote"
              aria-pressed={myVote === -1}
              aria-busy={votingDir === -1}
              disabled={votingDir !== null}
            >
              {votingDir === -1 ? (
                <Loader2 size={9.5} className="is-spinning" />
              ) : (
                <ThumbsDown size={9.5} fill={myVote === -1 ? 'currentColor' : 'none'} />
              )}
              <span>{item.downvotes}</span>
            </button>

            {/* Reply button */}
            <button
              type="button"
              className={`action-reply-btn${replyingToId === item.id ? ' is-active' : ''}`}
              onClick={() => {
                if (replyingToId === item.id) {
                  setReplyingToId(null);
                  setReplyTargetName('');
                } else {
                  setReplyingToId(item.id);
                  setReplyTargetName(item.user_name);
                  setReplyContent('');
                }
              }}
            >
              <MessageSquare size={9.5} />
              <span>Reply</span>
            </button>

            {/* "..." options menu, sits next to Reply */}
            <div className={`comment-menu-wrap${menuOpenId === item.id ? ' is-open' : ''}`}>
              <button
                type="button"
                className={`comment-menu-btn${menuOpenId === item.id ? ' is-open' : ''}`}
                aria-label="Comment options"
                aria-haspopup="menu"
                aria-expanded={menuOpenId === item.id}
                onClick={() => setMenuOpenId(menuOpenId === item.id ? null : item.id)}
              >
                <MoreHorizontal size={10} />
              </button>
              {menuOpenId === item.id && (
                <div className="comment-menu" role="menu">
                  {/* Everyone can share */}
                  <button type="button" role="menuitem" className="comment-menu-item" onClick={() => void handleCopyLink(item)}>
                    <Link2 size={9} />
                    <span>{menuNotice?.id === item.id && menuNotice.action === 'copy' ? 'Link copied' : 'Share'}</span>
                  </button>

                  {/* Logged-in readers get the full menu */}
                  {currentUserId && (
                    <>
                      <button type="button" role="menuitem" className="comment-menu-item" onClick={() => handleInfo(item)}>
                        <Info size={9} />
                        <span>Info</span>
                      </button>
                      {isOwnComment && (
                        <button type="button" role="menuitem" className="comment-menu-item" onClick={() => handleStartEdit(item)}>
                          <Pencil size={9} />
                          <span>Edit</span>
                        </button>
                      )}
                      {!isOwnComment && (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            className="comment-menu-item"
                            onClick={() => handleAddFriend(item)}
                          >
                            <UserPlus size={9} />
                            <span>{menuNotice?.id === item.id && menuNotice.action === 'friend' ? 'Friend added' : 'Add Friend'}</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="comment-menu-item"
                            onClick={() => void handleReport(item)}
                          >
                            <Flag size={9} />
                            <span>{menuNotice?.id === item.id && menuNotice.action === 'report' ? 'Report sent' : 'Report'}</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="comment-menu-item is-danger"
                            onClick={() => handleBlockUser(item)}
                          >
                            <Ban size={9} />
                            <span>Block</span>
                          </button>
                        </>
                      )}
                      {(isOwnComment || isAdmin) && (
                        <button
                          type="button"
                          role="menuitem"
                          className="comment-menu-item is-danger"
                          onClick={() => {
                            setMenuOpenId(null);
                            void handleDelete(item.id);
                          }}
                        >
                          <Trash2 size={9} />
                          <span>Delete</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Inline Reply Composer */}
          {replyingToId === item.id && (
            <div className="comment-inline-reply">
              <div className="comment-replying-ref comment-replying-ref--composer">
                <span>replying to</span>
                <span className="comment-replying-tag">@{replyTargetName}</span>
              </div>
              <ComposerBox
                value={replyContent}
                onChange={setReplyContent}
                placeholder="Write a reply..."
                maxLength={5000}
                autoFocus
              />
              <div className="composer-counter-row">
                <span>{replyContent.length}/5000</span>
              </div>
              <div className="composer-action-row">
                <button
                  type="button"
                  className="composer-cancel-btn"
                  onClick={() => {
                    setReplyingToId(null);
                    setReplyContent('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`composer-post-btn${replyContent.trim() ? ' has-content' : ''}`}
                  onClick={() => handleSubmitReply(parentId || item.id, item.user_name)}
                  disabled={!replyContent.trim() || replyPosting}
                >
                  <span>{replyPosting ? 'Posting...' : 'Reply'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Nested replies with accordion toggle */}
          {hasReplies && (
            <>
              <button
                type="button"
                className={`replies-toggle-btn${isRepliesExpanded ? ' is-expanded' : ''}`}
                onClick={() => toggleRepliesAccordion(item.id)}
                aria-expanded={isRepliesExpanded}
              >
                <span className="replies-toggle-dash" aria-hidden="true" />
                {isRepliesExpanded ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
                <span>{isRepliesExpanded ? 'Hide replies' : `View replies (${replyList.length})`}</span>
              </button>

              {isRepliesExpanded && (
                <div className="replies-thread">
                  {visibleReplies.map((reply) => renderComment(reply, true, item.id))}

                  {replyList.length > REPLY_PREVIEW_COUNT && (
                    <button
                      type="button"
                      className="replies-more-btn"
                      onClick={() => toggleShowAllReplies(item.id)}
                    >
                      {showAll ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                      <span>{showAll ? 'Show fewer replies' : `Show more replies (${hiddenReplyCount})`}</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const userInitial = (currentUserName || 'S').slice(0, 1).toUpperCase();

  return (
    <section className="series-discussion-section" aria-label="Series Discussion & Community Comments">
      {/* 1. Discussion Header Bar */}
      <div className="discussion-header">
        <div className="discussion-header-left">
          <div className="discussion-icon-wrap">
            <MessageSquare size={12} />
          </div>
          <h2 className="discussion-title">Discussion</h2>
          <span className="discussion-count">{totalCount}</span>
          {isAdminPreview && (
            <span className="discussion-admin-inline-tag">
              <ShieldAlert size={8} /> Admin Only
            </span>
          )}
        </div>

        {/* Sorter pills (Best / New / Old) */}
        <div className="discussion-sort-wrap">
          <div className="discussion-sort-group" role="tablist" aria-label="Sort comments">
            <button
              type="button"
              role="tab"
              aria-selected={sort === 'best'}
              className={`discussion-sort-btn${sort === 'best' ? ' is-active' : ''}`}
              onClick={() => setSort('best')}
            >
              <Flame size={8.5} /> Best
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sort === 'newest'}
              className={`discussion-sort-btn${sort === 'newest' ? ' is-active' : ''}`}
              onClick={() => setSort('newest')}
            >
              <Clock size={8.5} /> New
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sort === 'oldest'}
              className={`discussion-sort-btn${sort === 'oldest' ? ' is-active' : ''}`}
              onClick={() => setSort('oldest')}
            >
              <Hourglass size={8.5} /> Old
            </button>
          </div>
          <button
            type="button"
            className="toolbar-btn discussion-refresh-btn"
            onClick={handleRefresh}
            title="Refresh comments"
            aria-label="Refresh comments"
          >
            <RotateCw size={9} className={refreshing ? 'is-spinning' : ''} />
          </button>
        </div>
      </div>

      {blockedUsers.length > 0 && (
        <div className="discussion-blocked-note">
          <span>
            {blockedUsers.length} blocked {blockedUsers.length === 1 ? 'user' : 'users'}
          </span>
          <button type="button" onClick={() => persistBlockedUsers([])}>
            Unblock all
          </button>
        </div>
      )}

      {/* 2. Rich Text Composer Box */}
      <div className="discussion-composer-wrap">
        {/* Left User Avatar */}
        <div className="composer-avatar">
          {currentUserAvatar ? <img src={currentUserAvatar} alt="" /> : userInitial}
        </div>

        {/* Right Composer Card */}
        <div className="composer-card">
          <form onSubmit={handleSubmitComment}>
            <div className="composer-box">
              {/* Top Formatting Toolbar */}
              <div className="composer-toolbar">
                <div className="toolbar-group">
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={handleUndo}
                    title="Undo"
                    disabled={historyIndex <= 0}
                  >
                    <RotateCcw size={9.5} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={handleRedo}
                    title="Redo"
                    disabled={historyIndex >= history.length - 1}
                  >
                    <RotateCw size={9.5} />
                  </button>
                  <span className="toolbar-divider" />
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => wrapText('**', '**', 'bold text')}
                    title="Bold"
                  >
                    <Bold size={9.5} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => wrapText('*', '*', 'italic text')}
                    title="Italic"
                  >
                    <Italic size={9.5} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => wrapText('<u>', '</u>', 'underlined text')}
                    title="Underline"
                  >
                    <Underline size={9.5} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => wrapText('~~', '~~', 'strikethrough text')}
                    title="Strikethrough"
                  >
                    <Strikethrough size={9.5} />
                  </button>
                  <span className="toolbar-divider" />
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => {
                      const url = window.prompt('Enter link URL (https://...):');
                      if (url) wrapText('[', `](${url})`, 'link text');
                    }}
                    title="Link"
                  >
                    <Link2 size={9.5} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => wrapText('||', '||', 'spoiler')}
                    title="Spoiler tag"
                  >
                    <Eye size={9.5} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => wrapText('> ', '\n', 'quoted text')}
                    title="Quote"
                  >
                    <Quote size={9.5} />
                  </button>
                </div>

                <div className="toolbar-group">
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => {
                      const url = window.prompt('Enter image URL:');
                      if (url) insertAtCursor(`![image](${url})`);
                    }}
                    title="Add image"
                  >
                    <ImageIcon size={9.5} />
                  </button>
                  <button
                    type="button"
                    className={`toolbar-btn${showEmojiPicker ? ' is-active' : ''}`}
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    title="Emoji"
                  >
                    <Smile size={9.5} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => insertAtCursor('@')}
                    title="Mention"
                  >
                    <AtSign size={9.5} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => {
                      const gif = window.prompt('Enter GIF URL:');
                      if (gif) insertAtCursor(`![GIF](${gif})`);
                    }}
                    title="Insert GIF"
                  >
                    <span className="toolbar-gif-text">GIF</span>
                  </button>
                </div>
              </div>

              {/* Emoji Quick Picker Row */}
              {showEmojiPicker && (
                <div className="composer-emoji-picker">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="composer-emoji-btn"
                      onClick={() => insertAtCursor(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                className="composer-textarea"
                rows={3}
                placeholder="What are your thoughts?"
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                maxLength={5000}
              />
            </div>

            {/* Below the box: counter, then Post Comment on the far right */}
            <div className="composer-counter-row">
              <span>{content.length}/5000</span>
            </div>

            <div className="composer-action-row">
              <button
                type="submit"
                className={`composer-post-btn${content.trim() ? ' has-content' : ''}`}
                disabled={!content.trim() || posting}
              >
                <Send size={9} />
                <span>{posting ? 'Posting...' : 'Post Comment'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 3. Comments Feed */}
      <div className="discussion-comments-list">
        {loading ? (
          <div className="discussion-empty">
            <p>Loading discussion...</p>
          </div>
        ) : comments.length > 0 ? (
          comments.map((item) => renderComment(item))
        ) : (
          <div className="discussion-empty">
            <div className="discussion-empty-icon">
              <MessageSquare size={22} strokeWidth={1.5} />
            </div>
            <p>No comments yet. What are your thoughts?</p>
          </div>
        )}
      </div>

    </section>
  );
}
