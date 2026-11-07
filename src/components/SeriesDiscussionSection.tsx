import React, { useEffect, useState, useRef } from 'react';
import {
  MessageSquare,
  ThumbsUp,
  Heart,
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
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  fetchSeriesComments,
  addSeriesComment,
  voteSeriesComment,
  deleteSeriesComment,
  togglePinSeriesComment,
  type SeriesComment,
} from '../lib/comments';
import '../styles/series-discussion.css';

interface SeriesDiscussionProps {
  seriesSlug: string;
  seriesTitle?: string;
  isAdminPreview?: boolean;
}

const QUICK_EMOJIS = ['😊', '🔥', '❤️', '👍', '😂', '😭', '💀', '🎉', '✨', '👀'];

/** Replies shown under a comment before "Show more replies (n)" appears. */
const REPLY_PREVIEW_COUNT = 3;

/** Small coloured circle used in the reaction summary pill. */
function ReactionDot({ type }: { type: string }) {
  switch (type) {
    case 'love':
      return (
        <span className="reaction-dot dot-love">
          <Heart size={6} fill="currentColor" strokeWidth={0} />
        </span>
      );
    case 'happy':
    case 'laugh':
      return <span className="reaction-dot dot-emoji dot-laugh">😆</span>;
    case 'wow':
      return <span className="reaction-dot dot-emoji dot-wow">😮</span>;
    case 'sad':
      return <span className="reaction-dot dot-emoji dot-sad">😢</span>;
    case 'angry':
      return <span className="reaction-dot dot-emoji dot-angry">😡</span>;
    case 'like':
    default:
      return (
        <span className="reaction-dot dot-like">
          <ThumbsUp size={6} fill="currentColor" strokeWidth={0} />
        </span>
      );
  }
}

/** Top reaction types for a comment (max 3). Falls back to like + love. */
function getTopReactionTypes(item: SeriesComment): string[] {
  if (item.reactions) {
    const top = Object.entries(item.reactions)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key]) => key);
    if (top.length > 0) return top;
  }
  return ['like', 'love'];
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

  // Voting & Reactions
  const handleLike = async (comment: SeriesComment) => {
    const current = comment.user_vote || 0;
    const res = await voteSeriesComment(comment.id, seriesSlug, current, 1);

    const updateInTree = (list: SeriesComment[]): SeriesComment[] => {
      return list.map((c) => {
        if (c.id === comment.id) {
          const wasUpvoted = c.user_vote === 1;
          const nextUp = wasUpvoted ? Math.max(0, c.upvotes - 1) : c.upvotes + 1;
          return { ...c, user_vote: res.userVote, upvotes: nextUp };
        }
        if (c.replies && c.replies.length > 0) {
          return { ...c, replies: updateInTree(c.replies) };
        }
        return c;
      });
    };

    setComments((prev) => updateInTree(prev));
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
    const isRevealed = revealedSpoilers.has(item.id);
    const canManage = isAdmin || (currentUserId && item.user_id === currentUserId);
    const level = getLevel(item);
    const isRepliesExpanded = expandedReplies[item.id] !== false;
    const replyList = item.replies ?? [];
    const hasReplies = replyList.length > 0;
    const isLiked = item.user_vote === 1;

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
            {/* Like button */}
            <button
              type="button"
              className={`action-like-btn${isLiked ? ' is-liked' : ''}`}
              onClick={() => handleLike(item)}
              aria-label="Like comment"
            >
              <ThumbsUp size={9.5} fill={isLiked ? 'currentColor' : 'none'} />
              <span>Like</span>
            </button>

            {/* Reaction summary pill with overlapping coloured circles + count */}
            {reactionTotal > 0 && (
              <button
                type="button"
                className="action-reaction-pill"
                onClick={() => handleLike(item)}
                title="Reactions"
              >
                <span className="reaction-cluster">
                  {getTopReactionTypes(item).map((type) => (
                    <ReactionDot key={type} type={type} />
                  ))}
                </span>
                <span className="reaction-count">{reactionTotal}</span>
              </button>
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
