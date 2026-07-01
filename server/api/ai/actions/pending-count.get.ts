// server/api/ai/actions/pending-count.get.ts
/**
 * Count of `pending` ai_actions for an org — feeds the AI Activity badge (the
 * HITL review queue). Cheap aggregate so the rail/panel can poll it without
 * pulling the whole feed.
 *
 * Auth: session + org membership, then reads via the admin client (same pattern
 * as actions.get.ts — client-side Directus perms on ai_actions are NOT relied
 * upon). Fails soft to `{ count: 0 }` so a badge never breaks the shell.
 */
import { aggregate } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const query = getQuery(event);
  const organizationId = (query.organizationId || '').toString();
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });

  await requireOrgMembership(event, organizationId);

  try {
    const directus = getTypedDirectus();
    const res = (await directus.request(
      aggregate('ai_actions' as any, {
        aggregate: { count: ['*'] },
        query: {
          filter: {
            _and: [
              { organization: { _eq: organizationId } },
              { status: { _eq: 'pending' } },
            ],
          },
        },
      }),
    )) as any[];
    return { count: Number(res?.[0]?.count ?? 0) };
  } catch (error: any) {
    console.warn('[ai/actions/pending-count] failed:', error?.message);
    return { count: 0 };
  }
});
