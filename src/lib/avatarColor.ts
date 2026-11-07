import type { CSSProperties } from 'react';

/**
 * Shared avatar fallback color, used by the comments and the admin/profile pages
 * so the same person always gets the same color everywhere.
 *
 * Every shade is a 700-level tone so white initials stay readable.
 */
const AVATAR_PALETTE = [
  '#be185d', // pink
  '#b91c1c', // red
  '#c2410c', // orange
  '#b45309', // amber
  '#4d7c0f', // lime
  '#047857', // emerald
  '#0f766e', // teal
  '#0369a1', // sky
  '#1d4ed8', // blue
  '#4338ca', // indigo
  '#6d28d9', // violet
  '#a21caf', // fuchsia
] as const;

/** Picks a stable color for a seed (user id when known, otherwise the display name). */
export function getAvatarColor(seed?: string | null): string {
  const text = (seed || 'reader').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/** Inline style that sets the --avatar-bg variable read by the avatar CSS. */
export function getAvatarStyle(seed?: string | null): CSSProperties {
  return { '--avatar-bg': getAvatarColor(seed) } as CSSProperties;
}
