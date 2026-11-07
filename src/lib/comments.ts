import { supabase } from './supabase';

export interface SeriesComment {
  id: string;
  series_slug: string;
  user_id?: string;
  user_name: string;
  user_avatar?: string;
  user_role: string;
  parent_id?: string | null;
  reply_to_name?: string;
  content: string;
  is_spoiler: boolean;
  is_pinned: boolean;
  type: 'comment' | 'review';
  rating?: number | null;
  upvotes: number;
  downvotes: number;
  user_vote?: 1 | -1 | 0;
  created_at: string;
  level?: number;
  reactions?: Record<string, number>;
  user_reaction?: string;
  replies?: SeriesComment[];
}

const LOCAL_STORAGE_PREFIX = 'clydee_comments_';
const LOCAL_VOTES_PREFIX = 'clydee_comment_votes_';
const LOCAL_USER_ID_KEY = 'clydee_local_user_id';
const LOCAL_REACTIONS_PREFIX = 'clydee_comment_reactions_';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reaction types a reader can pick on a comment (same keys as the series reaction bar). */
export const COMMENT_REACTION_KEYS = ['like', 'love', 'happy', 'wow', 'sad', 'angry'] as const;
export type CommentReactionKey = (typeof COMMENT_REACTION_KEYS)[number];

function isReactionKey(value: unknown): value is CommentReactionKey {
  return typeof value === 'string' && (COMMENT_REACTION_KEYS as readonly string[]).includes(value);
}

/** Optional display identity saved with a reaction (used by the "Reactions" popover). */
export interface CommentReactorIdentity {
  name?: string;
  avatar?: string;
}

/** A reader who reacted with a name. */
export interface CommentReactor {
  id: string;
  name: string;
  handle: string;
  avatar?: string;
  reaction: CommentReactionKey;
}

/** Everyone who reacted to one comment: named readers plus per-reaction guest counts. */
export interface CommentReactorList {
  named: CommentReactor[];
  guests: Partial<Record<CommentReactionKey, number>>;
}

function reactorHandle(name: string, userId: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'reader';
  const tail = userId.replace(/[^a-z0-9]/gi, '').slice(-4).toLowerCase();
  return `@${base}${tail ? `_${tail}` : ''}`;
}

/** Sample readers used only to preview the Reactions UI on the built-in demo comments. */
const DEMO_REACTOR_NAMES = [
  'seiera',
  'Rohit Malik',
  'Max',
  'anonous05',
  'Desu08',
  'Salman Osman',
  'gunpark',
  'Mika',
  'Kuro',
];

/**
 * Loads who reacted to a comment, grouped by reaction.
 * Needs supabase/comments-reactor-names.sql for names; without it every reaction counts as a guest.
 * Demo and local-only comments have no per-reader rows, so they are rebuilt from their counts.
 */
export async function fetchCommentReactors(comment: SeriesComment): Promise<CommentReactorList> {
  const result: CommentReactorList = { named: [], guests: {} };
  const addGuests = (key: CommentReactionKey, amount = 1) => {
    result.guests[key] = (result.guests[key] || 0) + amount;
  };

  if (supabase && UUID_RE.test(comment.id)) {
    try {
      let rows: any[] | null = null;
      const withNames = await supabase
        .from('series_comment_votes')
        .select('reaction, user_id, user_name, user_avatar')
        .eq('comment_id', comment.id)
        .eq('vote', 1)
        .order('created_at', { ascending: false });
      if (!withNames.error && Array.isArray(withNames.data)) {
        rows = withNames.data;
      } else {
        const plain = await supabase
          .from('series_comment_votes')
          .select('reaction, user_id')
          .eq('comment_id', comment.id)
          .eq('vote', 1)
          .order('created_at', { ascending: false });
        if (!plain.error && Array.isArray(plain.data)) rows = plain.data;
      }

      if (rows) {
        for (const row of rows) {
          const key: CommentReactionKey = isReactionKey(row.reaction) ? row.reaction : 'like';
          const name = typeof row.user_name === 'string' ? row.user_name.trim() : '';
          if (name) {
            const userId = String(row.user_id ?? name);
            result.named.push({
              id: userId,
              name,
              handle: reactorHandle(name, userId),
              avatar: typeof row.user_avatar === 'string' && row.user_avatar ? row.user_avatar : undefined,
              reaction: key,
            });
          } else {
            addGuests(key);
          }
        }
        return result;
      }
    } catch {
      // fall through to the count-based list below
    }
  }

  const counts: Record<string, number> = {};
  for (const [rawKey, count] of Object.entries(comment.reactions || {})) {
    if (count > 0) {
      const key = rawKey === 'laugh' ? 'happy' : rawKey;
      if (isReactionKey(key)) counts[key] = (counts[key] || 0) + count;
    }
  }
  if (Object.keys(counts).length === 0 && comment.upvotes > 0) counts.like = comment.upvotes;

  const isDemo = comment.id.startsWith('demo_');
  let poolIndex = 0;
  for (const key of COMMENT_REACTION_KEYS) {
    const count = counts[key] || 0;
    if (count === 0) continue;
    const namedCount = isDemo ? Math.min(count, 3) : 0;
    for (let index = 0; index < namedCount; index += 1) {
      const name = DEMO_REACTOR_NAMES[poolIndex % DEMO_REACTOR_NAMES.length];
      poolIndex += 1;
      const id = `${comment.id}_${key}_${index}`;
      result.named.push({ id, name, handle: reactorHandle(name, id), reaction: key });
    }
    if (count > namedCount) addGuests(key, count - namedCount);
  }
  return result;
}

function getLocalUserReaction(commentId: string): CommentReactionKey | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const v = localStorage.getItem(`${LOCAL_REACTIONS_PREFIX}${commentId}`);
    return isReactionKey(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

function setLocalUserReaction(commentId: string, reaction: CommentReactionKey | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    if (!reaction) {
      localStorage.removeItem(`${LOCAL_REACTIONS_PREFIX}${commentId}`);
    } else {
      localStorage.setItem(`${LOCAL_REACTIONS_PREFIX}${commentId}`, reaction);
    }
  } catch {}
}

function getLocalUserId(): string {
  if (typeof window === 'undefined') return 'anon';
  let id = localStorage.getItem(LOCAL_USER_ID_KEY);
  if (!id) {
    id = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      localStorage.setItem(LOCAL_USER_ID_KEY, id);
    } catch {}
  }
  return id;
}

function getLocalUserVote(commentId: string): 1 | -1 | 0 {
  if (typeof window === 'undefined') return 0;
  try {
    const v = localStorage.getItem(`${LOCAL_VOTES_PREFIX}${commentId}`);
    if (v === '1') return 1;
    if (v === '-1') return -1;
  } catch {}
  return 0;
}

function setLocalUserVote(commentId: string, vote: 1 | -1 | 0): void {
  if (typeof window === 'undefined') return;
  try {
    if (vote === 0) {
      localStorage.removeItem(`${LOCAL_VOTES_PREFIX}${commentId}`);
    } else {
      localStorage.setItem(`${LOCAL_VOTES_PREFIX}${commentId}`, String(vote));
    }
  } catch {}
}

function getLocalComments(slug: string): SeriesComment[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${slug}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalComments(slug: string, comments: SeriesComment[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${slug}`, JSON.stringify(comments));
  } catch {}
}

/**
 * Fetches all comments for a series, structures them into a nested parent-reply tree,
 * and sorts according to the requested order ('best', 'newest', 'oldest').
 */
export async function fetchSeriesComments(
  seriesSlug: string,
  sort: 'best' | 'newest' | 'oldest' = 'best',
  filterType: 'all' | 'comment' | 'review' = 'all',
): Promise<{ comments: SeriesComment[]; totalCount: number }> {
  const localUserId = getLocalUserId();
  let rawComments: SeriesComment[] = [];

  if (supabase) {
    try {
      let query = supabase
        .from('series_comments')
        .select('*')
        .eq('series_slug', seriesSlug);

      if (filterType !== 'all') {
        query = query.eq('type', filterType);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        rawComments = data.map((row: any) => ({
          id: row.id,
          series_slug: row.series_slug,
          user_id: row.user_id,
          user_name: row.user_name || 'Reader',
          user_avatar: row.user_avatar,
          user_role: row.user_role || 'Reader',
          parent_id: row.parent_id,
          content: row.content,
          is_spoiler: Boolean(row.is_spoiler),
          is_pinned: Boolean(row.is_pinned),
          type: row.type === 'review' ? 'review' : 'comment',
          rating: row.rating ? parseFloat(row.rating) : null,
          upvotes: typeof row.upvotes === 'number' ? row.upvotes : 0,
          downvotes: typeof row.downvotes === 'number' ? row.downvotes : 0,
          created_at: row.created_at,
          user_vote: getLocalUserVote(row.id),
        }));
      } else {
        // Fall back to local storage if table is missing
        rawComments = getLocalComments(seriesSlug);
      }
    } catch {
      rawComments = getLocalComments(seriesSlug);
    }
  } else {
    rawComments = getLocalComments(seriesSlug);
  }

  // Apply local vote overrides + the reader's own reaction
  rawComments = rawComments.map((c) => {
    const vote = getLocalUserVote(c.id);
    return {
      ...c,
      user_vote: vote,
      user_reaction: vote === 1 ? getLocalUserReaction(c.id) ?? 'like' : undefined,
    };
  });

  // Load per-type reaction counts from Supabase.
  // Needs the `reaction` column from supabase/comments-reactions.sql; silently skipped if missing.
  if (supabase) {
    const remoteIds = rawComments.map((c) => c.id).filter((id) => UUID_RE.test(id));
    if (remoteIds.length > 0) {
      try {
        const counts = new Map<string, Record<string, number>>();
        const mine = new Map<string, CommentReactionKey>();
        let ok = true;

        for (let i = 0; i < remoteIds.length; i += 100) {
          const { data, error } = await supabase
            .from('series_comment_votes')
            .select('comment_id, reaction, user_id')
            .in('comment_id', remoteIds.slice(i, i + 100))
            .eq('vote', 1);
          if (error || !Array.isArray(data)) {
            ok = false;
            break;
          }
          for (const row of data as any[]) {
            const key: CommentReactionKey = isReactionKey(row.reaction) ? row.reaction : 'like';
            const bucket = counts.get(row.comment_id) ?? {};
            bucket[key] = (bucket[key] || 0) + 1;
            counts.set(row.comment_id, bucket);
            if (row.user_id === localUserId) mine.set(row.comment_id, key);
          }
        }

        if (ok) {
          rawComments = rawComments.map((c) => {
            const own = mine.get(c.id);
            return {
              ...c,
              reactions: counts.get(c.id) ?? c.reactions,
              user_reaction: own ?? c.user_reaction,
              user_vote: own ? 1 : c.user_vote,
            };
          });
        }
      } catch {
        // reactions are optional; keep plain upvote counts
      }
    }
  }

  const totalCount = rawComments.length;

  // Build tree: map parents and child replies
  const commentMap = new Map<string, SeriesComment>();
  const topLevel: SeriesComment[] = [];

  for (const c of rawComments) {
    commentMap.set(c.id, { ...c, replies: [] });
  }

  for (const c of commentMap.values()) {
    if (c.parent_id && commentMap.has(c.parent_id)) {
      commentMap.get(c.parent_id)!.replies!.push(c);
    } else {
      topLevel.push(c);
    }
  }

  // Sorter helper
  const sortFn = (a: SeriesComment, b: SeriesComment): number => {
    // Pinned always floats to the very top
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;

    if (sort === 'best') {
      const scoreA = a.upvotes - a.downvotes;
      const scoreB = b.upvotes - b.downvotes;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    }
    if (sort === 'oldest') {
      return Date.parse(a.created_at) - Date.parse(b.created_at);
    }
    // 'newest'
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  };

  topLevel.sort(sortFn);

  // Sort nested replies (always oldest first so conversations read chronologically)
  for (const item of topLevel) {
    if (item.replies && item.replies.length > 0) {
      item.replies.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    }
  }

  return { comments: topLevel, totalCount };
}

/**
 * Creates and posts a new comment or reply.
 */
export async function addSeriesComment(params: {
  seriesSlug: string;
  content: string;
  userName: string;
  userAvatar?: string;
  userRole?: string;
  userId?: string;
  parentId?: string | null;
  replyToName?: string;
  level?: number;
  isSpoiler?: boolean;
  type?: 'comment' | 'review';
  rating?: number | null;
}): Promise<SeriesComment> {
  const newComment: SeriesComment = {
    id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    series_slug: params.seriesSlug,
    user_id: params.userId,
    user_name: params.userName.trim() || 'Reader',
    user_avatar: params.userAvatar,
    user_role: params.userRole || 'Reader',
    parent_id: params.parentId || null,
    reply_to_name: params.replyToName,
    content: params.content.trim(),
    is_spoiler: Boolean(params.isSpoiler),
    is_pinned: false,
    type: params.type === 'review' ? 'review' : 'comment',
    rating: params.rating ?? null,
    upvotes: 0,
    downvotes: 0,
    user_vote: 0,
    level: params.level || 1,
    reactions: {},
    created_at: new Date().toISOString(),
    replies: [],
  };

  if (supabase) {
    try {
      const payload: Record<string, unknown> = {
        series_slug: newComment.series_slug,
        user_name: newComment.user_name,
        user_avatar: newComment.user_avatar,
        user_role: newComment.user_role,
        parent_id: newComment.parent_id,
        content: newComment.content,
        is_spoiler: newComment.is_spoiler,
        is_pinned: false,
        type: newComment.type,
        rating: newComment.rating,
      };

      if (params.userId) {
        payload.user_id = params.userId;
      }

      const { data, error } = await supabase
        .from('series_comments')
        .insert(payload)
        .select()
        .single();

      if (!error && data) {
        return {
          id: data.id,
          series_slug: data.series_slug,
          user_id: data.user_id,
          user_name: data.user_name,
          user_avatar: data.user_avatar,
          user_role: data.user_role,
          parent_id: data.parent_id,
          content: data.content,
          is_spoiler: Boolean(data.is_spoiler),
          is_pinned: Boolean(data.is_pinned),
          type: data.type,
          rating: data.rating ? parseFloat(data.rating) : null,
          upvotes: data.upvotes || 0,
          downvotes: data.downvotes || 0,
          user_vote: 0,
          created_at: data.created_at,
          replies: [],
        };
      }
    } catch {
      // fall back to localStorage
    }
  }

  // Local storage fallback
  const localList = getLocalComments(params.seriesSlug);
  localList.push(newComment);
  saveLocalComments(params.seriesSlug, localList);
  return newComment;
}

/**
 * Handles upvoting or downvoting a comment.
 * vote: 1 (up), -1 (down), 0 (remove vote)
 */
export async function voteSeriesComment(
  commentId: string,
  seriesSlug: string,
  currentVote: 1 | -1 | 0,
  newVote: 1 | -1 | 0,
): Promise<{ userVote: 1 | -1 | 0 }> {
  // If clicking the same button, toggle it off
  const targetVote = currentVote === newVote ? 0 : newVote;
  const localUserId = getLocalUserId();

  setLocalUserVote(commentId, targetVote);

  if (supabase) {
    try {
      if (targetVote === 0) {
        await supabase
          .from('series_comment_votes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', localUserId);
      } else {
        await supabase
          .from('series_comment_votes')
          .upsert(
            { comment_id: commentId, user_id: localUserId, vote: targetVote },
            { onConflict: 'comment_id,user_id' },
          );
      }
    } catch {}
  }

  // Also update local storage cache if present
  const localList = getLocalComments(seriesSlug);
  const found = localList.find((c) => c.id === commentId);
  if (found) {
    if (currentVote === 1) found.upvotes = Math.max(0, found.upvotes - 1);
    if (currentVote === -1) found.downvotes = Math.max(0, found.downvotes - 1);
    if (targetVote === 1) found.upvotes += 1;
    if (targetVote === -1) found.downvotes += 1;
    saveLocalComments(seriesSlug, localList);
  }

  return { userVote: targetVote };
}

/**
 * Sets, switches or removes the reader's reaction on a comment.
 * Picking the reaction you already have removes it. A reaction counts as one upvote.
 */
export async function reactSeriesComment(
  commentId: string,
  seriesSlug: string,
  currentReaction: CommentReactionKey | undefined,
  nextReaction: CommentReactionKey,
  reactor?: CommentReactorIdentity,
): Promise<{ userReaction: CommentReactionKey | undefined }> {
  const target = currentReaction === nextReaction ? undefined : nextReaction;
  const localUserId = getLocalUserId();

  setLocalUserVote(commentId, target ? 1 : 0);
  setLocalUserReaction(commentId, target);

  if (supabase) {
    try {
      if (!target) {
        await supabase
          .from('series_comment_votes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', localUserId);
      } else {
        const base = { comment_id: commentId, user_id: localUserId, vote: 1, reaction: target };
        // user_name / user_avatar need supabase/comments-reactor-names.sql; retry without them if missing
        let { error } = await supabase
          .from('series_comment_votes')
          .upsert(
            (reactor?.name ? { ...base, user_name: reactor.name, user_avatar: reactor.avatar ?? null } : base) as any,
            { onConflict: 'comment_id,user_id' },
          );
        if (error && reactor?.name) {
          ({ error } = await supabase
            .from('series_comment_votes')
            .upsert(base, { onConflict: 'comment_id,user_id' }));
        }
        if (error) {
          // `reaction` column not migrated yet: store it as a plain upvote instead
          await supabase
            .from('series_comment_votes')
            .upsert(
              { comment_id: commentId, user_id: localUserId, vote: 1 },
              { onConflict: 'comment_id,user_id' },
            );
        }
      }
    } catch {}
  }

  // Keep the local-storage comment cache in sync
  const localList = getLocalComments(seriesSlug);
  const found = localList.find((c) => c.id === commentId);
  if (found) {
    const reactions = { ...(found.reactions || {}) };
    if (currentReaction) {
      reactions[currentReaction] = Math.max(0, (reactions[currentReaction] || 0) - 1);
      if (!reactions[currentReaction]) delete reactions[currentReaction];
    }
    if (target) reactions[target] = (reactions[target] || 0) + 1;
    found.reactions = reactions;
    if (currentReaction && !target) found.upvotes = Math.max(0, found.upvotes - 1);
    if (!currentReaction && target) found.upvotes += 1;
    saveLocalComments(seriesSlug, localList);
  }

  return { userReaction: target };
}

/**
 * Deletes a comment.
 */
export async function deleteSeriesComment(commentId: string, seriesSlug: string): Promise<boolean> {
  if (supabase) {
    try {
      const { error } = await supabase
        .from('series_comments')
        .delete()
        .eq('id', commentId);
      if (!error) return true;
    } catch {}
  }

  const localList = getLocalComments(seriesSlug).filter((c) => c.id !== commentId && c.parent_id !== commentId);
  saveLocalComments(seriesSlug, localList);
  return true;
}

/**
 * Pins or unpins a comment (Admin only).
 */
export async function togglePinSeriesComment(
  commentId: string,
  seriesSlug: string,
  isPinned: boolean,
): Promise<boolean> {
  if (supabase) {
    try {
      const { error } = await supabase
        .from('series_comments')
        .update({ is_pinned: isPinned })
        .eq('id', commentId);
      if (!error) return true;
    } catch {}
  }

  const localList = getLocalComments(seriesSlug);
  const found = localList.find((c) => c.id === commentId);
  if (found) {
    found.is_pinned = isPinned;
    saveLocalComments(seriesSlug, localList);
  }
  return true;
}

/**
 * Edits the text of a comment (the author, or an admin).
 * Tries Supabase first; if that is unavailable or refuses, the edit is kept in the local cache.
 */
export async function editSeriesComment(commentId: string, seriesSlug: string, content: string): Promise<boolean> {
  const text = content.trim();
  if (!text) return false;

  if (supabase) {
    try {
      const { error } = await supabase.from('series_comments').update({ content: text }).eq('id', commentId);
      if (!error) return true;
    } catch {}
  }

  const localList = getLocalComments(seriesSlug);
  const found = localList.find((c) => c.id === commentId);
  if (found) {
    found.content = text;
    saveLocalComments(seriesSlug, localList);
  }
  return true;
}

const LOCAL_REPORTS_KEY = 'clydee_comment_reports';

/**
 * Reports a comment to the moderators.
 * Needs supabase/comment-reports.sql; if the table is missing (or the comment only exists
 * on this device) the report is kept in localStorage instead so nothing breaks.
 */
export async function reportSeriesComment(commentId: string, seriesSlug: string, reason: string): Promise<void> {
  if (supabase && UUID_RE.test(commentId)) {
    try {
      const { error } = await supabase.from('series_comment_reports').insert({
        comment_id: commentId,
        series_slug: seriesSlug,
        reason: reason || null,
        reporter_id: getLocalUserId(),
      });
      if (!error) return;
    } catch {
      // fall through to the local copy
    }
  }

  if (typeof window === 'undefined') return;
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_REPORTS_KEY) || '[]');
    const list = Array.isArray(parsed) ? parsed : [];
    list.push({ commentId, seriesSlug, reason, reportedAt: new Date().toISOString() });
    localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(list));
  } catch {}
}
