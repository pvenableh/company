/**
 * useComments - Polymorphic comment management for the new project timeline system
 */

import type {
  ProjectComment,
  CommentMention,
  CommentWithRelations,
  CreateCommentPayload,
  UpdateCommentPayload,
  CommentCountInfo,
} from '~/types/comments';

export function useComments() {
  const comments = useDirectusItems<ProjectComment>('comments');
  const commentMentions = useDirectusItems<CommentMention>('comment_mentions');
  const { user } = useDirectusAuth();

  const COMMENT_UPLOADS_FOLDER = 'comment-uploads';

  const getComments = async (
    targetCollection: string,
    targetId: string,
    options?: {
      includeReplies?: boolean;
      parentId?: string | null;
      limit?: number;
      offset?: number;
    }
  ): Promise<CommentWithRelations[]> => {
    const filter: Record<string, any> = {
      target_collection: { _eq: targetCollection },
      target_id: { _eq: targetId },
    };

    if (options?.parentId !== undefined) {
      filter.parent_id = options.parentId ? { _eq: options.parentId } : { _null: true };
    }

    const result = await comments.list({
      fields: [
        '*',
        'user_created.id',
        'user_created.first_name',
        'user_created.last_name',
        'user_created.avatar',
        'mentions.id',
        'mentions.user_id.id',
        'mentions.user_id.first_name',
        'mentions.user_id.last_name',
        'files.id',
        'files.directus_files_id.id',
        'files.directus_files_id.filename_download',
        'files.directus_files_id.type',
        'files.directus_files_id.filesize',
        ...(options?.includeReplies ? [
          'replies.id',
          'replies.content',
          'replies.date_created',
          'replies.user_created.id',
          'replies.user_created.first_name',
          'replies.user_created.last_name',
          'replies.user_created.avatar',
        ] : []),
      ],
      filter,
      sort: ['date_created'],
      limit: options?.limit || 100,
    });

    return result as CommentWithRelations[];
  };

  const createComment = async (data: CreateCommentPayload): Promise<ProjectComment> => {
    const comment = await comments.create({
      content: data.content,
      target_collection: data.target_collection,
      target_id: data.target_id,
      parent_id: data.parent_id || null,
      is_edited: false,
      is_resolved: false,
    } as Partial<ProjectComment>);

    if (data.mentioned_user_ids?.length) {
      for (const userId of data.mentioned_user_ids) {
        if (userId !== user.value?.id) {
          await commentMentions.create({
            comment_id: comment.id,
            user_id: userId,
            notified: false,
          } as Partial<CommentMention>);
        }
      }
    }

    return comment;
  };

  const updateComment = async (commentId: string, data: UpdateCommentPayload): Promise<ProjectComment> => {
    return await comments.update(commentId, {
      content: data.content,
      is_edited: true,
      ...(data.is_resolved !== undefined && { is_resolved: data.is_resolved }),
    } as Partial<ProjectComment>);
  };

  const deleteComment = async (commentId: string): Promise<boolean> => {
    return await comments.remove(commentId);
  };

  const toggleResolved = async (commentId: string, resolved: boolean): Promise<ProjectComment> => {
    return await comments.update(commentId, { is_resolved: resolved } as Partial<ProjectComment>);
  };

  const getCommentCount = async (
    targetCollection: string,
    targetId: string
  ): Promise<CommentCountInfo> => {
    const totalCount = await comments.count({
      target_collection: { _eq: targetCollection },
      target_id: { _eq: targetId },
    });

    const unresolvedCount = await comments.count({
      target_collection: { _eq: targetCollection },
      target_id: { _eq: targetId },
      is_resolved: { _eq: false },
    });

    return {
      target_collection: targetCollection,
      target_id: targetId,
      total_count: totalCount,
      unresolved_count: unresolvedCount,
    };
  };

  const canEditComment = (comment: ProjectComment | CommentWithRelations): boolean => {
    if (!user.value?.id) return false;
    const authorId = typeof comment.user_created === 'string'
      ? comment.user_created
      : comment.user_created?.id;
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
    COMMENT_UPLOADS_FOLDER,
  };
}
