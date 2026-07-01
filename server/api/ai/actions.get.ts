// server/api/ai/actions.get.ts
/**
 * List AI actions (the ai_actions audit log) for the "AI Activity" view.
 *
 * Org-wide by default; optionally scoped to a single entity when both
 * `entityType` + `entityId` are supplied (used by the per-document activity
 * timeline on proposals/contracts).
 *
 * Auth: session + org membership, then reads via the admin client. We do NOT
 * rely on client-side Directus perms for ai_actions (setup-ai-actions-
 * permissions.ts is not required) — same admin-client + requireOrgMembership
 * pattern as server/api/ai/generate-documents.post.ts.
 *
 * Query:
 *   organizationId (required)
 *   entityType?    — e.g. 'proposals' | 'contracts' | 'leads' (paired w/ entityId)
 *   entityId?      — record id (paired w/ entityType)
 *   status?        — pending | approved | rejected | executed | failed
 *   limit?         — default 50, max 200
 */
import { readItems } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

const VALID_STATUSES = ['pending', 'approved', 'rejected', 'executed', 'failed'];

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const query = getQuery(event);
  const organizationId = (query.organizationId || '').toString();
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });

  const entityType = (query.entityType || '').toString().trim();
  const entityId = (query.entityId || '').toString().trim();
  const status = (query.status || '').toString().trim();
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);

  await requireOrgMembership(event, organizationId);

  const conditions: any[] = [{ organization: { _eq: organizationId } }];
  // Entity scoping only when BOTH parts are present — otherwise org-wide.
  if (entityType && entityId) {
    conditions.push({ entity_type: { _eq: entityType } });
    conditions.push({ entity_id: { _eq: entityId } });
  }
  if (status && VALID_STATUSES.includes(status)) {
    conditions.push({ status: { _eq: status } });
  }

  const directus = getTypedDirectus();

  try {
    const actions = await directus.request(
      readItems('ai_actions' as any, {
        filter: { _and: conditions },
        fields: [
          'id', 'action_type', 'status', 'title', 'result', 'preview',
          'entity_type', 'entity_id', 'error', 'date_created',
          'user.id', 'user.first_name', 'user.last_name', 'user.avatar',
        ],
        sort: ['-date_created'],
        limit,
      }),
    );
    return { actions: actions || [] };
  } catch (error: any) {
    console.error('[ai/actions] Error:', error?.message);
    throw createError({
      statusCode: error?.statusCode || 500,
      message: error?.message || 'Failed to fetch AI actions',
    });
  }
});
