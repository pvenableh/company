// server/api/ai/sessions/by-route.get.ts
/**
 * Find the most recent active chat session for a route-scoped (general)
 * conversation — the unified Earnest panel's per-scope threads (goals, work,
 * dashboard, …). Sibling of by-entity.get.ts for non-entity context.
 *
 * Query params:
 *   scope:    coarse bucket ('work' | 'goals' | 'money' | …)
 *   routeKey: persistence key (currently == scope)
 *
 * Returns: { session, messages, savedMessageIds } or { session: null }.
 */

import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const query = getQuery(event);
  const scope = typeof query.scope === 'string' ? query.scope : '';
  const routeKey = typeof query.routeKey === 'string' ? query.routeKey : scope;

  if (!scope) {
    throw createError({ statusCode: 400, message: 'scope is required' });
  }

  const directus = await getUserDirectus(event);

  try {
    // Directus can't deep-filter the JSON context column, so pull recent
    // sessions with context and match in-memory (same approach as by-entity).
    const sessions = await directus.request(
      readItems('ai_chat_sessions', {
        filter: {
          _and: [
            { user: { _eq: userId } },
            { status: { _eq: 'active' } },
            { context: { _nnull: true } },
          ],
        },
        fields: ['id', 'title', 'status', 'context', 'date_created', 'date_updated'],
        sort: ['-date_updated'],
        limit: 20,
      }),
    ) as any[];

    // Match a route session: context.route === routeKey (or scope fallback).
    // Skip entity sessions (those carry entityType/entityId instead).
    const match = sessions.find((s: any) => {
      const ctx = s.context;
      if (!ctx || ctx.entityType) return false;
      return ctx.route === routeKey || ctx.scope === scope;
    });

    if (!match) {
      return { session: null, messages: [] };
    }

    const [messages, savedNotes] = await Promise.all([
      directus.request(
        readItems('ai_chat_messages', {
          filter: { session: { _eq: match.id } },
          fields: ['id', 'role', 'content', 'date_created'],
          sort: ['date_created'],
          limit: 50,
        }),
      ),
      directus.request(
        readItems('ai_notes', {
          filter: {
            _and: [
              { user: { _eq: userId } },
              { source_session: { _eq: match.id } },
              { status: { _eq: 'active' } },
              { source_message_id: { _nnull: true } },
            ],
          },
          fields: ['source_message_id'],
          limit: 200,
        }),
      ).catch(() => []) as Promise<any[]>,
    ]);

    const savedMessageIds = (savedNotes as any[])
      .map((n) => n.source_message_id)
      .filter(Boolean);

    return { session: match, messages, savedMessageIds };
  } catch (error: any) {
    console.error('[ai/sessions/by-route] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to find route session',
    });
  }
});
