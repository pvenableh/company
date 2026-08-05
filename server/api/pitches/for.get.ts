/**
 * Pitch pages linked to a given record (client / lead / contact), for surfacing
 * on that record's detail (e.g. the PursuitTimeline). Derives the org from the
 * record itself, enforces the same `proposals`-feature read gate the other pitch
 * endpoints use, and reads with the admin server token so pitch_pages stays
 * unlistable to the browser. Never returns the HTML body or password hash.
 *
 * Query: exactly one of client=<uuid> | lead=<int> | contact=<uuid>.
 */
import { readItems } from '@directus/sdk';
import { requireOrgPermission } from '~~/server/utils/org-permissions';

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const client = q.client ? String(q.client) : '';
  const leadRaw = q.lead ? String(q.lead) : '';
  const contact = q.contact ? String(q.contact) : '';
  const lead = leadRaw && /^\d+$/.test(leadRaw) ? Number(leadRaw) : null;

  const directus = getServerDirectus();

  // Resolve the owning organization from the linked record so we can gate on it.
  let organization = '';
  if (client) {
    const rows = (await directus.request(readItems('clients', {
      filter: { id: { _eq: client } }, fields: ['organization'], limit: 1,
    }))) as any[];
    organization = rows?.[0]?.organization || '';
  } else if (lead != null) {
    const rows = (await directus.request(readItems('leads', {
      filter: { id: { _eq: lead } }, fields: ['organization'], limit: 1,
    }))) as any[];
    organization = rows?.[0]?.organization || '';
  } else if (contact) {
    const rows = (await directus.request(readItems('contacts', {
      filter: { id: { _eq: contact } }, fields: ['organizations.organizations_id'], limit: 1,
    }))) as any[];
    organization = rows?.[0]?.organizations?.[0]?.organizations_id || '';
  } else {
    throw createError({ statusCode: 400, message: 'Provide one of client, lead, or contact.' });
  }

  if (!organization) return { data: [] };
  await requireOrgPermission(event, organization, 'proposals', 'read');

  const filter: any = { organization: { _eq: organization } };
  if (client) filter.client = { _eq: client };
  else if (lead != null) filter.lead = { _eq: lead };
  else filter.contact = { _eq: contact };

  const rows = (await directus.request(readItems('pitch_pages', {
    filter,
    fields: ['id', 'title', 'status', 'token', 'view_count', 'expires_at', 'date_created'],
    sort: ['-date_created'],
    limit: 50,
  }))) as any[];

  return {
    data: (rows || []).map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      view_count: r.view_count ?? 0,
      expires_at: r.expires_at,
      url: `/p/${r.token}`,
    })),
  };
});
