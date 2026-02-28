/**
 * useComments - Polymorphic comment management for the project timeline system
 *
 * Uses existing `comments` collection with fields: collection, item, comment, user, parent_id.
 * Field names match the existing Directus schema.
 */

import type {
  TimelineComment,
  CommentWithRelations,
  CreateCommentPayload,
  UpdateCommentPayload,
  CommentCountInfo,
} from '~/types/comments';

export function useComments() {
  const comments = useDirectusItems<TimelineComment>('comments');
  const { user } = useDirectusAuth();

  const getComments = async (
    collection: string,
    itemId: string,
    options?: {
      includeReplies?: boolean;
      parentId?: number | null;
      limit?: number;
    }
  ): Promise<CommentWithRelations[]> => {
    const filter: Record<string, any> = {
      collection: { _eq: collection },
      item: { _eq: itemId },
    };

    if (options?.parentId !== undefined) {
      filter.parent_id = options.parentId ? { _eq: options.parentId } : { _null: true };
    }

    const result = await comments.list({
      fields: [
        '*',
        'user.id',
        'user.first_name',
        'user.last_name',
        'user.avatar',
        ...(options?.includeReplies ? [
          'replies.id',
          'replies.comment',
          'replies.date_created',
          'replies.user.id',
          'replies.user.first_name',
          'replies.user.last_name',
          'replies.user.avatar',
        ] : []),
      ],
      filter,
      sort: ['date_created'],
      limit: options?.limit || 100,
    });

    return result as CommentWithRelations[];
  };

  const createComment = async (data: CreateCommentPayload): Promise<TimelineComment> => {
    return await comments.create({
      status: 'published',
      comment: data.comment,
      collection: data.collection,
      item: data.item,
      user: user.value?.id || null,
      parent_id: data.parent_id || null,
      is_edited: false,
      is_resolved: false,
    } as Partial<TimelineComment>);
  };

  const updateComment = async (commentId: number, data: UpdateCommentPayload): Promise<TimelineComment> => {
    return await comments.update(commentId, {
      comment: data.comment,
      is_edited: true,
      ...(data.is_resolved !== undefined && { is_resolved: data.is_resolved }),
    } as Partial<TimelineComment>);
  };

  const deleteComment = async (commentId: number): Promise<boolean> => {
    return await comments.remove(commentId);
  };

  const toggleResolved = async (commentId: number, resolved: boolean): Promise<TimelineComment> => {
    return await comments.update(commentId, { is_resolved: resolved } as Partial<TimelineComment>);
  };

  const getCommentCount = async (
    collection: string,
    itemId: string
  ): Promise<CommentCountInfo> => {
    const totalCount = await comments.count({
      collection: { _eq: collection },
      item: { _eq: itemId },
    });

    const unresolvedCount = await comments.count({
      collection: { _eq: collection },
      item: { _eq: itemId },
      is_resolved: { _eq: false },
    });

    return {
      collection,
      item: itemId,
      total_count: totalCount,
      unresolved_count: unresolvedCount,
    };
  };

  const canEditComment = (comment: TimelineComment | CommentWithRelations): boolean => {
    if (!user.value?.id) return false;
    const authorId = typeof comment.user === 'string'
      ? comment.user
      : comment.user?.id;
    return authorId === user.value.id;
  };

  return {
    getComments,
    createComment,
    updateComment,
    deleteComment,
    toggleResolved,
    getCommentCount,
    canEditComment,
  };
}
