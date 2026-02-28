/**
 * Comments System Types - Uses existing Directus `comments` collection
 *
 * Existing fields: id (number), collection, item, comment, user, parent_id, status
 * New fields to add in Directus: is_edited (boolean), is_resolved (boolean)
 */

import type { User } from '../system';

/**
 * Maps to the existing `comments` collection.
 * Field names match Directus: `collection`, `item`, `comment`, `user`.
 */
export interface TimelineComment {
  id: number;
  status: 'published' | 'draft' | 'archived';
  sort: number | null;
  user_created: string | User | null;
  date_created: string | null;
  user_updated: string | User | null;
  date_updated: string | null;
  /** The commenter - existing field */
  user: string | User | null;
  /** Comment HTML content - existing field */
  comment: string | null;
  /** Polymorphic: which collection - existing field */
  collection: string | null;
  /** Polymorphic: item UUID - existing field */
  item: string | null;
  /** For threading - existing field */
  parent_id: number | null;
  /** Legacy M2O shortcut - existing field */
  tickets_id: string | null;
  /** New: track if comment was edited */
  is_edited: boolean | null;
  /** New: allow marking comments resolved */
  is_resolved: boolean | null;
  replies?: TimelineComment[];
}

export interface CommentWithRelations extends Omit<TimelineComment, 'user'> {
  user: User | null;
  replies: CommentWithRelations[];
  reply_count?: number;
}

export interface CreateCommentPayload {
  comment: string;
  collection: string;
  item: string;
  parent_id?: number;
}

export interface UpdateCommentPayload {
  comment: string;
  is_resolved?: boolean;
}

export interface CommentCountInfo {
  collection: string;
  item: string;
  total_count: number;
  unresolved_count: number;
}

export interface CommentTargetProps {
  collection: string;
  itemId: string;
}
