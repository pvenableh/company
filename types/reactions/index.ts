/**
 * Reactions System Types
 *
 * Base schema type re-exported from auto-generated directus.ts.
 * App-level types (groups, summaries, payloads, constants) defined here.
 *
 * Supports both legacy reactions (love/like/idea/dislike with Heroicons)
 * and emoji reactions (any fluent-emoji-flat identifier).
 */

// Re-export base schema type (rename to ReactionRecord for app usage)
export type { Reaction as ReactionRecord } from '../directus';

import type { Reaction } from '../directus';
import type { User } from '../system';

/** Legacy reaction identifiers (backward compatible with existing DB data) */
export type LegacyReactionType = 'love' | 'like' | 'idea' | 'dislike';

/** Reaction identifier — either a legacy string or a fluent-emoji icon name */
export type ReactionType = string;

export interface ReactionWithUser extends Omit<Reaction, 'user'> {
  user: User;
}

export interface ReactionGroup {
  reaction: string;
  count: number;
  users: User[];
  hasReacted: boolean;
  activeReactionId: string | null;
}

export interface ReactionSummary {
  item: string;
  collection: string;
  groups: ReactionGroup[];
  totalCount: number;
}

export interface CreateReactionPayload {
  collection: string;
  item: string;
  reaction: string;
}

/** Legacy reaction icons (Heroicons with outline/solid variants) */
export const LEGACY_REACTION_ICONS: Record<LegacyReactionType, { outline: string; solid: string }> = {
  love: { outline: 'i-heroicons-heart', solid: 'i-heroicons-heart-solid' },
  like: { outline: 'i-heroicons-hand-thumb-up', solid: 'i-heroicons-hand-thumb-up-solid' },
  idea: { outline: 'i-heroicons-light-bulb', solid: 'i-heroicons-light-bulb-solid' },
  dislike: { outline: 'i-heroicons-hand-thumb-down', solid: 'i-heroicons-hand-thumb-down-solid' },
};

/** Legacy types in display order */
export const LEGACY_REACTION_TYPES: LegacyReactionType[] = ['love', 'like', 'idea', 'dislike'];

/** Check if a reaction string is a legacy type with heroicon mappings */
export function isLegacyReaction(reaction: string): reaction is LegacyReactionType {
  return ['love', 'like', 'idea', 'dislike'].includes(reaction);
}

/** Get the icon name for any reaction. Legacy → heroicons, emoji → fluent-emoji-flat. */
export function getReactionIcon(reaction: string, active: boolean = false): string {
  if (isLegacyReaction(reaction)) {
    return active ? LEGACY_REACTION_ICONS[reaction].solid : LEGACY_REACTION_ICONS[reaction].outline;
  }
  return `fluent-emoji-flat:${reaction}`;
}

/** Curated emoji set for the picker, organized by category */
export const EMOJI_CATEGORIES: Record<string, string[]> = {
  'Quick Reactions': ['love', 'like', 'idea', 'dislike'],
  'Smileys': [
    'grinning-face',
    'face-with-tears-of-joy',
    'smiling-face-with-heart-eyes',
    'thinking-face',
    'face-with-open-mouth',
    'winking-face',
    'smiling-face-with-sunglasses',
    'face-screaming-in-fear',
    'crying-face',
    'angry-face',
  ],
  'Gestures': [
    'thumbs-up',
    'thumbs-down',
    'clapping-hands',
    'raising-hands',
    'folded-hands',
    'flexed-biceps',
    'waving-hand',
    'victory-hand',
  ],
  'Symbols': [
    'fire',
    'party-popper',
    'rocket',
    'star',
    'check-mark-button',
    'cross-mark',
    'eyes',
    'hundred-points',
    'collision',
    'red-heart',
  ],
};
