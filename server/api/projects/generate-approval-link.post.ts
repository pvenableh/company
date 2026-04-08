/**
 * Generate a unique approval link token for a project event.
 * Authenticated endpoint — only internal team can generate links.
 */
import { updateItem, readItem } from '@directus/sdk';
import { randomBytes } from 'crypto';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const { eventId } = await readBody(event);
  if (!eventId) {
    throw createError({ statusCode: 400, message: 'Event ID is required' });
  }

  const directus = await getUserDirectus(event);

  // Check if event already has a token
  const existing = await directus.request(
    readItem('project_events', eventId, { fields: ['id', 'approval_token', 'approval'] })
  );

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Event not found' });
  }

  // Reuse existing token if one exists
  if (existing.approval_token) {
    return { token: existing.approval_token };
  }

  // Generate new token
  const token = randomBytes(32).toString('hex');

  await directus.request(
    updateItem('project_events', eventId, { approval_token: token })
  );

  return { token };
});
