/**
 * Comments System Types - Polymorphic for any collection
 */

import type { User } from '../system';
import type { File } from '../system';

export interface ProjectComment {
  id: string;
  user_created: string | User | null;
  date_created: string | null;
  date_updated: string | null;
  content: string;
  target_collection: string;
  target_id: string;
  parent_id: string | ProjectComment | null;
  is_edited: boolean;
  is_resolved: boolean;
  mentions?: CommentMention[];
  files?: CommentFile[];
  replies?: ProjectComment[];
}

export interface CommentMention {
  id: number;
  comment_id: string | ProjectComment;
  user_id: string | User;
  notified: boolean;
  date_created: string | null;
}

export interface CommentFile {
  id: number;
  comment_id: string | ProjectComment;
  directus_files_id: string | File;
  sort: number | null;
}

export interface CommentWithRelations extends Omit<ProjectComment, 'user_created' | 'parent_id' | 'mentions' | 'files' | 'replies'> {
  user_created: User | null;
  parent_id: ProjectComment | null;
  mentions: (Omit<CommentMention, 'user_id'> & { user_id: User })[];
  files: (Omit<CommentFile, 'directus_files_id'> & { directus_files_id: File })[];
  replies: CommentWithRelations[];
  reply_count?: number;
}

export interface CreateCommentPayload {
  content: string;
  target_collection: string;
  target_id: string;
  parent_id?: string;
  mentioned_user_ids?: string[];
}

export interface UpdateCommentPayload {
  content: string;
  is_resolved?: boolean;
}

export interface CommentCountInfo {
  target_collection: string;
  target_id: string;
  total_count: number;
  unresolved_count: number;
}

export interface CommentTargetProps {
  targetCollection: string;
  targetId: string;
}
