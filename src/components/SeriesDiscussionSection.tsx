import React, { useEffect, useState, useRef } from 'react';
import {
  MessageSquare,
  ThumbsUp,
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
  Sparkles,
  Flame,
  Clock,
  Hourglass,
  MoreHorizontal,
  Share2,
  Flag,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  fetchSeriesComments,
  fetchCommentReactors,
  reportSeriesComment,
  addSeriesComment,
  reactSeriesComment,
  deleteSeriesComment,
  togglePinSeriesComment,
  type SeriesComment,
  type CommentReactionKey,
  type CommentReactorList,
} from '../lib/comments';
import angryReactionIcon from '../assets/reactions/angry.webp';
import cryReactionIcon from '../assets/reactions/cry.webp';
import laughReactionIcon from '../assets/reactions/laugh.webp';
import likeReactionIcon from '../assets/reactions/like.webp';
import loveReactionIcon from '../assets/reactions/love.webp';
import wowReactionIcon from '../assets/reactions/wow.webp';
import { ReactorsPopover, ReactionsModal, buildReactionGroups } from './CommentReactors';
import '../styles/series-discussion.css';

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

/** Reactions shown in the hover picker (same icons as the series reaction bar). */
const REACTIONS: { key: CommentReactionKey; label: string; icon: string; color: string }[] = [
  { key: 'like', label: 'Like', icon: likeReactionIcon, color: '#3b82f6' },
  { key: 'love', label: 'Love', icon: loveReactionIcon, color: '#ef4444' },
  { key: 'happy', label: 'Haha', icon: laughReactionIcon, color: '#f59e0b' },
  { key: 'wow', label: 'Wow', icon: wowReactionIcon, color: '#f59e0b' },
  { key: 'sad', label: 'Sad', icon: cryReactionIcon, color: '#f59e0b' },
  { key: 'angry', label: 'Angry', icon: angryReactionIcon, color: '#ea580c' },
];

/** Looks up a reaction by key. Accepts the legacy 'laugh' alias; unknown keys fall back to like. */
function resolveReaction(key: string) {
  const normalized = key === 'laugh' ? 'happy' : key;
  return REACTIONS.find((r) => r.key === normalized) ?? REACTIONS[0];
}

/** The reaction the current reader has on a comment, or null. */
function getMyReaction(item: SeriesComment) {
  if (item.user_reaction) return resolveReaction(item.user_reaction);
  return item.user_vote === 1 ? resolveReaction('like') : null;
}

/** Small round reaction icon used in the summary pill. */
function ReactionDot({ type }: { type: string }) {
  const reaction = resolveReaction(type);
  return (
    <span className="reaction-dot">
      <img src={reaction.icon} alt="" draggable={false} />
    </span>
  );
}

/** Top reaction types for a comment (max 3). Falls back to a single like. */
function getTopReactionTypes(item: SeriesComment): string[] {
  if (item.reactions) {
    const merged: Record<string, number> = {};
    for (const [key, count] of Object.entries(item.reactions)) {
      if (count > 0) {
        const resolved = resolveReaction(key).key;
        merged[resolved] = (merged[resolved] || 0) + count;
      }
    }
    const top = Object.entries(merged)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key]) => key);
    if (top.length > 0) return top;
  }
  return ['like'];
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

  // Hover / long-press reaction picker (which comment's picker is open)
  const [pickerOpenId, setPickerOpenId] = useState<string | null>(null);
  const pickerTimer = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  // Reaction summary: hover/tap popover + "See all reactions" dialog
  const [summaryOpenId, setSummaryOpenId] = useState<string | null>(null);
  const [reactionsModal, setReactionsModal] = useState<SeriesComment | null>(null);
  const [reactorsCache, setReactorsCache] = useState<Record<string, CommentReactorList>>({});
  const [reactorsLoadingId, setReactorsLoadingId] = useState<string | null>(null);
  const summaryTimer = useRef<number | null>(null);

  // Comment "..." menu (copy link / block user / report)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuNotice, setMenuNotice] = useState<{ id: string; action: 'copy' | 'report' } | null>(null);
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
  const flashMenuNotice = (id: string, action: 'copy' | 'report') => {
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

  const clearSummaryTimer = () => {
    if (summaryTimer.current) {
      window.clearTimeout(summaryTimer.current);
      summaryTimer.current = null;
    }
  };

  /** Loads who reacted to a comment once, then reuses it until reactions change. */
  const ensureReactors = (comment: SeriesComment) => {
    if (reactorsCache[comment.id] || reactorsLoadingId === comment.id) return;
    setReactorsLoadingId(comment.id);
    void fetchCommentReactors(comment)
      .then((list) => setReactorsCache((prev) => ({ ...prev, [comment.id]: list })))
      .catch(() => setReactorsCache((prev) => ({ ...prev, [comment.id]: { named: [], guests: {} } })))
      .finally(() => setReactorsLoadingId((current) => (current === comment.id ? null : current)));
  };

  const openReactionsModal = (comment: SeriesComment) => {
    clearSummaryTimer();
    setSummaryOpenId(null);
    ensureReactors(comment);
    setReactionsModal(comment);
  };

  const clearPickerTimer = () => {
    if (pickerTimer.current) {
      window.clearTimeout(pickerTimer.current);
      pickerTimer.current = null;
    }
  };

  const openPicker = (id: string) => {
    clearPickerTimer();
    pickerTimer.current = window.setTimeout(() => setPickerOpenId(id), 180);
  };

  const closePicker = () => {
    clearPickerTimer();
    pickerTimer.current = window.setTimeout(() => setPickerOpenId(null), 280);
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Close the picker when tapping/clicking anywhere outside it
  useEffect(() => {
    if (!pickerOpenId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.reaction-picker-wrap')) setPickerOpenId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pickerOpenId]);

  // Close the reaction summary popover when tapping/clicking anywhere outside it
  useEffect(() => {
    if (!summaryOpenId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.reaction-summary-wrap')) setSummaryOpenId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [summaryOpenId]);

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

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      clearPickerTimer();
      clearLongPress();
      clearSummaryTimer();
    };
  }, []);

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
      setReactorsCache({});

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

  // Reactions (like / love / haha / wow / sad / angry)
  const handleReact = async (comment: SeriesComment, next: CommentReactionKey) => {
    clearPickerTimer();
    setPickerOpenId(null);

    const mine = getMyReaction(comment);
    const current: CommentReactionKey | undefined = mine?.key;
    const target: CommentReactionKey | undefined = current === next ? undefined : next;

    const updateInTree = (list: SeriesComment[]): SeriesComment[] => {
      return list.map((c) => {
        if (c.id === comment.id) {
          const reactions = { ...(c.reactions || {}) };
          if (current) {
            reactions[current] = Math.max(0, (reactions[current] || 0) - 1);
            if (!reactions[current]) delete reactions[current];
          }
          if (target) reactions[target] = (reactions[target] || 0) + 1;

          let upvotes = c.upvotes;
          if (current && !target) upvotes = Math.max(0, upvotes - 1);
          if (!current && target) upvotes += 1;

          return { ...c, reactions, upvotes, user_reaction: target, user_vote: target ? (1 as const) : (0 as const) };
        }
        if (c.replies && c.replies.length > 0) {
          return { ...c, replies: updateInTree(c.replies) };
        }
        return c;
      });
    };

    // Optimistic update, then persist
    setComments((prev) => updateInTree(prev));
    setReactorsCache((prev) => {
      const next = { ...prev };
      delete next[comment.id];
      return next;
    });

    // Save the reader's display name with the reaction (admin session or guest nickname), if they have one
    let reactor: { name: string; avatar?: string } | undefined;
    if (currentUserId) {
      reactor = { name: currentUserName, avatar: currentUserAvatar ?? undefined };
    } else {
      try {
        const nickname = localStorage.getItem('clydee_guest_nickname')?.trim();
        if (nickname) reactor = { name: nickname };
      } catch {
        // storage unavailable: react as a guest
      }
    }
    try {
      await reactSeriesComment(comment.id, seriesSlug, current, next, reactor);
    } catch {
      // ignore
    }
  };

  // Clicking the Like button itself: add a like, or remove whatever reaction you have
  const handleLikeClick = (comment: SeriesComment) => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    const mine = getMyReaction(comment);
    void handleReact(comment, mine?.key ?? 'like');
  };

  // Delete
  const handleDelete = async (commentId: string) => {
    if (!window.confirm('Delete this comment?')) return;
    await deleteSeriesComment(commentId, seriesSlug);
    void loadComments(true);
  };

  // Pin
  const handleTogglePin = async (comment: SeriesComment) => {
    await togglePinSeriesComment(comment.id, seriesSlug, !comment.is_pinned);
    void loadComments(true);
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
    const canManage = isAdmin || (currentUserId && item.user_id === currentUserId);
    const level = getLevel(item);
    const isRepliesExpanded = expandedReplies[item.id] !== false;
    const replyList = (item.replies ?? []).filter((reply) => !blockedUsers.includes(reply.user_name));
    const hasReplies = replyList.length > 0;
    const myReaction = getMyReaction(item);
    const isOwnComment = Boolean(currentUserId && item.user_id === currentUserId);

    // Replies preview ("Show more replies (n)")
    const showAll = Boolean(showAllReplies[item.id]);
    const visibleReplies = showAll ? replyList : replyList.slice(0, REPLY_PREVIEW_COUNT);
    const hiddenReplyCount = replyList.length - REPLY_PREVIEW_COUNT;

    // Reactions count display (e.g. 37, 8, 7)
    const reactionTotal =
      item.upvotes > 0
        ? item.upvotes
        : item.reactions
        ? Object.values(item.reactions).reduce((a, b) => a + b, 0)
        : 0;

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
          {/* "..." options menu, top right of every comment */}
          <div className="comment-menu-wrap">
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
                <button type="button" role="menuitem" className="comment-menu-item" onClick={() => void handleCopyLink(item)}>
                  <Share2 size={9} />
                  <span>{menuNotice?.id === item.id && menuNotice.action === 'copy' ? 'Link copied' : 'Copy comment link'}</span>
                </button>
                {!isOwnComment && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="comment-menu-item is-danger"
                      onClick={() => handleBlockUser(item)}
                    >
                      <ShieldAlert size={9} />
                      <span>Block user</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="comment-menu-item is-danger"
                      onClick={() => void handleReport(item)}
                    >
                      <Flag size={9} />
                      <span>{menuNotice?.id === item.id && menuNotice.action === 'report' ? 'Report sent' : 'Report'}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Header row */}
          <div className="comment-header">
            <span className="comment-author-name">{item.user_name}</span>

            {/* Level badge */}
            <span className={`comment-level-badge${level > 50 ? ' is-high' : ''}`}>Lv {level}</span>

            {/* Role badge if applicable */}
            {item.user_role === 'Reading Legend' && (
              <span className="comment-role-badge role-reading-legend">
                <Sparkles size={6.5} /> Reading Legend
              </span>
            )}
            {item.user_role === 'Admin' && <span className="comment-role-badge role-admin">Admin</span>}
            {item.user_role === 'Scanlator' && <span className="comment-role-badge role-scanlator">Scanlator</span>}
            {item.user_role === 'VIP' && <span className="comment-role-badge role-vip">VIP</span>}

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

          {/* Comment text body or spoiler */}
          {item.is_spoiler && !isRevealed ? (
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
            {/* Like button with hover reaction picker */}
            <div
              className="reaction-picker-wrap"
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') openPicker(item.id);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') closePicker();
              }}
            >
              {pickerOpenId === item.id && (
                <div className="reaction-picker-pos">
                  <div className="reaction-picker" role="menu" aria-label="Choose a reaction">
                    {REACTIONS.map((reaction) => (
                      <button
                        key={reaction.key}
                        type="button"
                        role="menuitem"
                        className={`reaction-picker-btn${myReaction?.key === reaction.key ? ' is-selected' : ''}`}
                        onClick={() => void handleReact(item, reaction.key)}
                        aria-label={reaction.label}
                      >
                        <img src={reaction.icon} alt="" draggable={false} />
                        <span className="reaction-picker-tip">{reaction.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                className={`action-like-btn${myReaction ? ' is-reacted' : ''}`}
                style={myReaction ? { color: myReaction.color } : undefined}
                onClick={() => handleLikeClick(item)}
                onTouchStart={() => {
                  longPressFired.current = false;
                  clearLongPress();
                  longPressTimer.current = window.setTimeout(() => {
                    longPressFired.current = true;
                    setPickerOpenId(item.id);
                  }, 380);
                }}
                onTouchEnd={clearLongPress}
                onTouchMove={clearLongPress}
                onTouchCancel={clearLongPress}
                onContextMenu={(e) => e.preventDefault()}
                aria-label={myReaction ? `${myReaction.label} (tap to remove)` : 'Like comment'}
                aria-haspopup="menu"
              >
                {myReaction && myReaction.key !== 'like' ? (
                  <img className="action-like-icon" src={myReaction.icon} alt="" draggable={false} />
                ) : (
                  <ThumbsUp size={9.5} fill={myReaction ? 'currentColor' : 'none'} />
                )}
                <span>{myReaction ? myReaction.label : 'Like'}</span>
              </button>
            </div>

            {/* Reaction summary: hover (desktop) or tap opens who-reacted card; "See all reactions" opens the dialog */}
            {reactionTotal > 0 && (
              <div
                className="reaction-summary-wrap"
                onPointerEnter={(e) => {
                  if (e.pointerType !== 'mouse') return;
                  clearSummaryTimer();
                  summaryTimer.current = window.setTimeout(() => {
                    setSummaryOpenId(item.id);
                    ensureReactors(item);
                  }, 200);
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType !== 'mouse') return;
                  clearSummaryTimer();
                  summaryTimer.current = window.setTimeout(() => setSummaryOpenId(null), 250);
                }}
              >
                {summaryOpenId === item.id && (
                  <div className="reactors-popover-pos">
                    <ReactorsPopover
                      groups={buildReactionGroups(reactorsCache[item.id], REACTIONS)}
                      loading={!reactorsCache[item.id]}
                      onSeeAll={() => openReactionsModal(item)}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className="action-reaction-pill"
                  aria-haspopup="dialog"
                  aria-expanded={summaryOpenId === item.id}
                  title="See who reacted"
                  onClick={(e) => {
                    clearSummaryTimer();
                    const pointerType = (e.nativeEvent as PointerEvent).pointerType;
                    if (summaryOpenId === item.id && pointerType !== 'mouse') {
                      setSummaryOpenId(null);
                      return;
                    }
                    setSummaryOpenId(item.id);
                    ensureReactors(item);
                  }}
                >
                  <span className="reaction-cluster">
                    {getTopReactionTypes(item).map((type) => (
                      <ReactionDot key={type} type={type} />
                    ))}
                  </span>
                  <span className="reaction-count">{reactionTotal}</span>
                </button>
              </div>
            )}

            {/* Reply button */}
            <button
              type="button"
              className="action-reply-btn"
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

            {/* Pin comment (Admin) */}
            {isAdmin && !isChild && (
              <button
                type="button"
                className="action-admin-btn"
                onClick={() => handleTogglePin(item)}
                title="Pin comment"
              >
                <Pin size={8.5} />
              </button>
            )}

            {/* Delete comment */}
            {canManage && (
              <button
                type="button"
                className="action-admin-btn"
                onClick={() => handleDelete(item.id)}
                title="Delete comment"
              >
                <Trash2 size={8.5} />
              </button>
            )}
          </div>

          {/* Inline Reply Composer */}
          {replyingToId === item.id && (
            <div className="comment-inline-reply">
              <div className="composer-box">
                <textarea
                  className="composer-textarea composer-textarea--inline"
                  rows={1}
                  placeholder={`Replying to @${replyTargetName}...`}
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  maxLength={5000}
                  autoFocus
                />
              </div>
              <div className="composer-action-row">
                <button
                  type="button"
                  className="action-reply-btn"
                  onClick={() => {
                    setReplyingToId(null);
                    setReplyContent('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="composer-post-btn has-content"
                  onClick={() => handleSubmitReply(parentId || item.id, item.user_name)}
                  disabled={!replyContent.trim() || replyPosting}
                >
                  <Send size={9} />
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
                className="replies-toggle-btn"
                onClick={() => toggleRepliesAccordion(item.id)}
              >
                <span className="replies-toggle-dash" aria-hidden="true" />
                {isRepliesExpanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                <span>
                  {isRepliesExpanded
                    ? 'Hide replies'
                    : `${replyList.length} ${replyList.length === 1 ? 'reply' : 'replies'}`}
                </span>
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

      {reactionsModal && (
        <ReactionsModal
          groups={buildReactionGroups(reactorsCache[reactionsModal.id], REACTIONS)}
          loading={!reactorsCache[reactionsModal.id]}
          dark={typeof document !== 'undefined' && document.querySelector('.series-page.theme-dark') !== null}
          onClose={() => setReactionsModal(null)}
        />
      )}
    </section>
  );
}
