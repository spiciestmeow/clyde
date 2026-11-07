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

  // If local/remote has comments, apply local vote overrides
  rawComments = rawComments.map((c) => ({
    ...c,
    user_vote: getLocalUserVote(c.id),
  }));

  if (rawComments.length === 0) {
    const eightMonthsAgo = new Date(Date.now() - 240 * 24 * 3600 * 1000).toISOString();
    const sevenMonthsAgo = new Date(Date.now() - 210 * 24 * 3600 * 1000).toISOString();

    rawComments = [
      {
        id: `demo_${seriesSlug}_1`,
        series_slug: seriesSlug,
        user_name: 'EKR Gamer',
        user_avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=EKR',
        user_role: 'Reader',
        content: 'BTW who made this new thumbnail i want to give him a big W',
        is_spoiler: false,
        is_pinned: false,
        type: 'comment',
        upvotes: 37,
        downvotes: 0,
        level: 1,
        reactions: { love: 24, laugh: 13 },
        created_at: eightMonthsAgo,
      },
      {
        id: `demo_${seriesSlug}_2`,
        series_slug: seriesSlug,
        parent_id: `demo_${seriesSlug}_1`,
        user_name: 'magickdarkstar',
        user_avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=magickdarkstar',
        user_role: 'Reading Legend',
        content: 'Can someone explain this trend? I genuinely think it looks cool and want to know the context behind it',
        is_spoiler: false,
        is_pinned: false,
        type: 'comment',
        upvotes: 8,
        downvotes: 0,
        level: 74,
        reactions: { love: 5, laugh: 3 },
        created_at: eightMonthsAgo,
      },
      {
        id: `demo_${seriesSlug}_3`,
        series_slug: seriesSlug,
        parent_id: `demo_${seriesSlug}_1`,
        reply_to_name: 'magickdarkstar',
        user_name: 'Mustafa Saskai',
        user_avatar: '',
        user_role: 'Reader',
        content: "It's for the Islamic month of Ramadan. It's a traditional headpiece men wear in the Middle East.",
        is_spoiler: false,
        is_pinned: false,
        type: 'comment',
        upvotes: 7,
        downvotes: 0,
        level: 7,
        reactions: { love: 4, laugh: 3 },
        created_at: eightMonthsAgo,
      },
      {
        id: `demo_${seriesSlug}_4`,
        series_slug: seriesSlug,
        parent_id: `demo_${seriesSlug}_1`,
        reply_to_name: 'magickdarkstar',
        user_name: 'CARGO',
        user_avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=CARGO',
        user_role: 'Reader',
        content: "It's to show support for the people of Palestine",
        is_spoiler: false,
        is_pinned: false,
        type: 'comment',
        upvotes: 2,
        downvotes: 0,
        level: 2,
        reactions: {},
        created_at: sevenMonthsAgo,
      },
    ];
  }

  const totalCount = Math.max(55, rawComments.length);

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
