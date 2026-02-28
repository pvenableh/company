/**
 * Reactions System Types - Polymorphic for any collection
 */

import type { User } from '../system';

export type IconFamily = 'heroicons' | 'lucide' | 'fluent-emoji-flat' | 'emoji';

export interface ReactionTypeRecord {
  id: number;
  status: 'published' | 'draft';
  sort: number | null;
  name: string;
  emoji: string | null;
  icon: string | null;
  icon_family: IconFamily | null;
  user_created: string | User | null;
  user_updated: string | User | null;
  date_created: string | null;
  date_updated: string | null;
}

export type ReactableCollection = 'channel_messages' | 'comments' | 'project_events';

export interface ReactionRecord {
  id: number;
  user_created: string | User;
  date_created: string | null;
  collection: ReactableCollection;
  item_id: string;
  reaction_type: number | ReactionTypeRecord;
}

export interface ReactionWithRelations extends Omit<ReactionRecord, 'user_created' | 'reaction_type'> {
  user_created: User;
  reaction_type: ReactionTypeRecord;
}

export interface ReactionCount {
  reaction_type: ReactionTypeRecord;
  count: number;
  users: User[];
  hasReacted: boolean;
}

export interface ReactionSummary {
  item_id: string;
  collection: ReactableCollection;
  reactions: ReactionCount[];
  totalCount: number;
}

export interface CreateReactionPayload {
  collection: ReactableCollection;
  item_id: string;
  reaction_type: number;
}

export function getReactionIcon(reactionType: ReactionTypeRecord): string {
  if (!reactionType.icon_family || !reactionType.icon) return '';

  switch (reactionType.icon_family) {
    case 'heroicons':
      return `i-heroicons-${reactionType.icon}`;
    case 'lucide':
      return `i-lucide-${reactionType.icon}`;
    case 'fluent-emoji-flat':
      return `i-fluent-emoji-flat-${reactionType.icon}`;
    default:
      return reactionType.icon;
  }
}

export function getReactionIconFilled(reactionType: ReactionTypeRecord): string {
  if (!reactionType.icon_family || !reactionType.icon) return '';

  switch (reactionType.icon_family) {
    case 'heroicons':
      return `i-heroicons-${reactionType.icon}-solid`;
    case 'lucide':
      return `i-lucide-${reactionType.icon}`;
    default:
      return reactionType.icon;
  }
}
