/**
 * Reactions System Types
 *
 * Base schema type re-exported from auto-generated directus.ts.
 * App-level types (groups, summaries, payloads, constants) defined here.
 */

// Re-export base schema type (rename to ReactionRecord for app usage)
export type { Reaction as ReactionRecord } from '../directus';

import type { Reaction } from '../directus';
import type { User } from '../system';

/** The hardcoded reaction type strings used in the existing system */
export type ReactionType = 'love' | 'like' | 'idea' | 'dislike';

export interface ReactionWithUser extends Omit<Reaction, 'user'> {
  user: User;
}

export interface ReactionGroup {
  reaction: ReactionType;
  count: number;
  users: User[];
  hasReacted: boolean;
  activeReactionId: string | null;
}

export interface ReactionSummary {
  item: string;
  table: string;
  groups: ReactionGroup[];
  totalCount: number;
}

export interface CreateReactionPayload {
  table: string;
  item: string;
  reaction: ReactionType;
}

/** Hardcoded reaction icons matching existing Reactions/Button.vue */
export const REACTION_ICONS: Record<ReactionType, { outline: string; solid: string }> = {
  love: { outline: 'i-heroicons-heart', solid: 'i-heroicons-heart-solid' },
  like: { outline: 'i-heroicons-hand-thumb-up', solid: 'i-heroicons-hand-thumb-up-solid' },
  idea: { outline: 'i-heroicons-light-bulb', solid: 'i-heroicons-light-bulb-solid' },
  dislike: { outline: 'i-heroicons-hand-thumb-down', solid: 'i-heroicons-hand-thumb-down-solid' },
};

/** All available reaction types in display order */
export const REACTION_TYPES: ReactionType[] = ['love', 'like', 'idea', 'dislike'];
