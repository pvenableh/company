/**
 * Read messages from any session in the org — Admin only.
 * Verifies the session belongs to an org member before returning.
 *
 * Query params:
 *   sessionId:      string (required)
 *   organizationId: string (required)
 *   messageLimit?:  number (default 100, max 200)
 *
 * Returns: { session: {...}, messages: [...] }
 */
import { readItem, readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const organizationId = query.organizationId as string;
  const sessionId = query.sessionId as string;

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }
  if (!sessionId) {
    throw createError({ statusCode: 400, message: 'sessionId is required' });
  }

  await requireOrgPermission(event, organizationId, 'ai_usage', 'read');

  const messageLimit = Math.min(Math.max(Number(query.messageLimit) || 100, 1), 200);
  const directus = getTypedDirectus();

  // Fetch the session
  const session = await directus.request(
    readItem('ai_chat_sessions', sessionId, {
      fields: ['id', 'title', 'status', 'user', 'date_created', 'date_updated'],
    }),
  ) as any;

  if (!session) {
    throw createError({ statusCode: 404, message: 'Session not found' });
  }

  // Verify the session owner is a member of this org
  const sessionUserId = typeof session.user === 'object' ? session.user.id : session.user;
  const membership = await directus.request(
    readItems('org_memberships', {
      filter: {
        _and: [
          { user: { _eq: sessionUserId } },
          { organization: { _eq: organizationId } },
          { status: { _eq: 'active' } },
        ],
      },
      fields: ['id', 'user.id', 'user.first_name', 'user.last_name', 'user.avatar'],
      limit: 1,
    }),
  ) as any[];

  if (!membership?.[0]) {
    throw createError({ statusCode: 403, message: 'Session does not belong to this organization' });
  }

  const member = membership[0].user;

  // Fetch messages
  const messages = await directus.request(
    readItems('ai_chat_messages', {
      filter: { session: { _eq: sessionId } },
      fields: ['id', 'role', 'content', 'date_created'],
      sort: ['date_created'],
      limit: messageLimit,
    }),
  ) as any[];

  return {
    session: {
      ...session,
      user_name: [member?.first_name, member?.last_name].filter(Boolean).join(' ') || 'Unknown',
      user_avatar: member?.avatar || null,
    },
    messages,
  };
});
