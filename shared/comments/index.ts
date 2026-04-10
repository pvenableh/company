/**
 * Comments System Types
 *
 * Base schema type re-exported from auto-generated directus.ts.
 * App-level types (payloads, resolved relations) defined here.
 */

// Re-export base schema type (rename to TimelineComment for app usage)
export type { Comment as TimelineComment } from '../directus';

import type { Comment } from '../directus';
import type { User } from '../system';

export interface CommentWithRelations extends Omit<Comment, 'user'> {
  user: User | null;
  replies: CommentWithRelations[];
  reply_count?: number;
  hidden_by?: string | User | null;
  hidden_at?: string | null;
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

export type CommentReportReason = 'spam' | 'inappropriate' | 'harassment' | 'off_topic' | 'other';

export interface ReportCommentPayload {
  comment: number;
  reason: CommentReportReason;
  details?: string;
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
