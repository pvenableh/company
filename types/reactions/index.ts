/**
 * Reactions System Types - Uses existing Directus `reactions` collection
 *
 * Existing fields: id (string/uuid), table, item, reaction (string), user, status
 * Keeps existing string-based reaction types ('love', 'like', 'idea', 'dislike').
 * No reaction_types lookup table needed.
 */

import type { User } from '../system';

/** The hardcoded reaction type strings used in the existing system */
export type ReactionType = 'love' | 'like' | 'idea' | 'dislike';

/**
 * Maps to the existing `reactions` collection.
 * Field names match Directus: `table` (collection), `item`, `reaction`, `user`.
 */
export interface ReactionRecord {
  id: string;
  status: 'published' | 'draft' | 'archived';
  sort: number | null;
  user_created: string | User | null;
  date_created: string | null;
  user_updated: string | User | null;
  date_updated: string | null;
  /** The reactor - existing field */
  user: string | User | null;
  /** Reaction type string - existing field */
  reaction: ReactionType | string | null;
  /** Polymorphic: item UUID - existing field */
  item: string | null;
  /** Polymorphic: which collection - existing field */
  table: string | null;
  date_added: string | null;
}

export interface ReactionWithUser extends Omit<ReactionRecord, 'user'> {
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
