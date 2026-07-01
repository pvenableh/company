// server/api/ai/actions/bulk.post.ts
/**
 * Bulk approve / reject pending AI actions.
 *
 * Body: { ids: (string|number)[], decision: 'approve' | 'reject' }
 *
 * Each id is processed independently through the SAME shared helper the single
 * endpoints use (server/utils/ai-action-decide.ts): load row → org-verify caller
 * → guard pending → approve (dispatch executor) or reject. A failure on one id
 * (not found, already resolved, executor threw, not a member of its org) is
 * folded into that row's per-item result — the batch NEVER fails as a whole.
 *
 * Org membership is verified per-row (rows may span orgs). To avoid re-hitting
 * requireOrgMembership for every id in a large same-org batch, verified org ids
 * are memoised for the life of the request.
 *
 * Returns: { results: [{ id, status, result?, error? }], approved, rejected, failed }
 */
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { decideAiAction } from '~~/server/utils/ai-action-decide';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const body = (await readBody(event).catch(() => ({}))) || {};
  const decision = (body as any).decision;
  const rawIds = (body as any).ids;

  if (decision !== 'approve' && decision !== 'reject') {
    throw createError({ statusCode: 400, message: "decision must be 'approve' or 'reject'" });
  }
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    throw createError({ statusCode: 400, message: 'ids must be a non-empty array' });
  }

  // De-dupe ids (a repeated id would otherwise 409 itself on the second pass).
  const ids = Array.from(new Set(rawIds.map((v: any) => String(v)).filter(Boolean)));
  if (ids.length === 0) throw createError({ statusCode: 400, message: 'ids must contain at least one valid id' });
  if (ids.length > 200) throw createError({ statusCode: 400, message: 'Too many ids (max 200 per batch)' });

  // Memoise org-membership checks across the batch: verify each distinct org once.
  const orgChecks = new Map<string, Promise<unknown>>();
  const verifyOrg = (orgId: string): Promise<unknown> => {
    let p = orgChecks.get(orgId);
    if (!p) {
      p = requireOrgMembership(event, orgId);
      orgChecks.set(orgId, p);
    }
    return p;
  };

  const results: Array<{ id: string; status: string; result?: any; error?: string }> = [];
  let approved = 0;
  let rejected = 0;
  let failed = 0;

  // Sequential: executors write to Directus, and a same-org batch shares one
  // membership check anyway — keep it simple and predictable over parallel.
  for (const id of ids) {
    try {
      const res = await decideAiAction({ id, decision, userId, verifyOrg });
      results.push({ id, status: res.status, result: res.result });
      if (res.status === 'executed') approved++;
      else rejected++;
    } catch (err: any) {
      failed++;
      results.push({ id, status: 'failed', error: err?.statusMessage || err?.message || 'Failed' });
    }
  }

  return { results, approved, rejected, failed };
});
