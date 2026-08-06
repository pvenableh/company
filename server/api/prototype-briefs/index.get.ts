/**
 * List an org's prototype briefs (staff, org-scoped), optionally filtered to a
 * pitch or proposal. Powers the "past briefs" history on the pitch/proposal
 * surfaces. Admin-token read (the collection has no client row perms).
 */
import { readItems } from '@directus/sdk';
import { requireOrgPermission } from '~~/server/utils/org-permissions';
import { getServerDirectus } from '~~/server/utils/directus';

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const organization = String(q.organization || '');
  if (!organization) throw createError({ statusCode: 400, message: 'organization is required' });

  await requireOrgPermission(event, organization, 'proposals', 'read');

  const filter: Record<string, any> = { organization: { _eq: organization } };
  if (q.pitch && /^\d+$/.test(String(q.pitch))) filter.pitch = { _eq: Number(q.pitch) };
  else if (q.proposal) filter.proposal = { _eq: String(q.proposal) };
  else if (q.link) {
    const m = /^(client|lead|contact):(.+)$/.exec(String(q.link));
    if (m) filter[m[1]] = { _eq: m[1] === 'lead' ? Number(m[2]) : m[2] };
  }

  try {
    const rows = (await getServerDirectus().request(readItems('prototype_briefs' as any, {
      filter,
      fields: ['id', 'title', 'source', 'version', 'status', 'date_created', 'brief_markdown'],
      sort: ['-date_created'],
      limit: 50,
    } as any))) as any[];
    return { data: rows || [] };
  } catch {
    // Collection not provisioned yet → empty history (feature degrades gracefully).
    return { data: [] };
  }
});
