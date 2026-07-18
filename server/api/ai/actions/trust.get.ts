// server/api/ai/actions/trust.get.ts
/**
 * The "trust compounds" signal for the current user in an org: how many actions
 * they've approved that Earnest then executed cleanly, vs how many they've
 * rejected. The dial uses this to decide when to nudge the user toward more
 * autonomy — trust that has been earned, not assumed.
 *
 * Auth + read pattern mirror pending-count.get.ts (session + org membership,
 * admin client, fails soft to zeros so the dial never breaks).
 */
import { aggregate } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

async function countActions(directus: any, organizationId: string, userId: string, status: string): Promise<number> {
  const res = (await directus.request(
    aggregate('ai_actions' as any, {
      aggregate: { count: ['*'] },
      query: {
        filter: {
          _and: [
            { organization: { _eq: organizationId } },
            { approved_by: { _eq: userId } },
            { status: { _eq: status } },
          ],
        },
      },
    }),
  )) as any[];
  return Number(res?.[0]?.count ?? 0);
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const organizationId = (getQuery(event).organizationId || '').toString();
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });

  await requireOrgMembership(event, organizationId);

  try {
    const directus = getTypedDirectus();
    const [approved, rejected] = await Promise.all([
      countActions(directus, organizationId, userId, 'executed'),
      countActions(directus, organizationId, userId, 'rejected'),
    ]);
    return { approved, rejected };
  } catch (error: any) {
    console.warn('[ai/actions/trust] failed:', error?.message);
    return { approved: 0, rejected: 0 };
  }
});
