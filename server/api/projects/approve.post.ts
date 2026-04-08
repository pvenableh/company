/**
 * Public approval endpoint — no auth required.
 * Validates the approval token and updates the event status.
 */
import { readItems, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const { token, action, comment } = await readBody(event);

  if (!token) {
    throw createError({ statusCode: 400, message: 'Approval token is required' });
  }

  if (!action || !['approve', 'request_changes'].includes(action)) {
    throw createError({ statusCode: 400, message: 'Action must be "approve" or "request_changes"' });
  }

  // Use admin client since this is a public endpoint
  const directus = getTypedDirectus();

  // Find event by token
  const events = await directus.request(
    readItems('project_events', {
      filter: { approval_token: { _eq: token } },
      fields: ['id', 'title', 'approval', 'project.id', 'project.title'],
      limit: 1,
    })
  );

  if (!events?.length) {
    throw createError({ statusCode: 404, message: 'Invalid or expired approval link' });
  }

  const projectEvent = events[0] as any;

  if (projectEvent.approval === 'Approved') {
    return { success: true, message: 'This event has already been approved', alreadyApproved: true };
  }

  if (action === 'approve') {
    await directus.request(
      updateItem('project_events', projectEvent.id, {
        approval: 'Approved',
        approved_at: new Date().toISOString(),
      })
    );

    return {
      success: true,
      message: 'Event approved successfully',
      eventTitle: projectEvent.title,
    };
  }

  if (action === 'request_changes') {
    // Keep status as 'Need Approval' but add comment if provided
    // The comment will be visible in the event detail
    if (comment?.trim()) {
      try {
        // Create a comment on the event via the junction
        const commentItem = await directus.request(
          (await import('@directus/sdk')).createItem('project_events_comments', {
            project_events_id: projectEvent.id,
            comment: comment.trim(),
            date_created: new Date().toISOString(),
          })
        );
      } catch (err) {
        console.error('[approve] Failed to create comment:', err);
      }
    }

    return {
      success: true,
      message: 'Change request submitted',
      eventTitle: projectEvent.title,
    };
  }
});
