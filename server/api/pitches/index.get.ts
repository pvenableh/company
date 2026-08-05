/**
 * List an org's pitch pages (staff, org-scoped). Never returns the HTML body or
 * the password hash — just what the management list needs. Gated behind the
 * `proposals` feature.
 */
import { readItems } from '@directus/sdk';
import { requireOrgPermission } from '~~/server/utils/org-permissions';

export default defineEventHandler(async (event) => {
  const organization = String(getQuery(event).organization || '');
  if (!organization) throw createError({ statusCode: 400, message: 'organization is required' });

  await requireOrgPermission(event, organization, 'proposals', 'read');

  const directus = getServerDirectus();
  const rows = (await directus.request(
    readItems('pitch_pages', {
      filter: { organization: { _eq: organization } },
      fields: [
        'id', 'title', 'client_name', 'token', 'status',
        'expires_at', 'view_count', 'last_viewed_at', 'date_created',
        'password_hash', // fetched only to derive has_password; stripped below
      ],
      sort: ['-date_created'],
      limit: 200,
    }),
  )) as any[];

  const data = (rows || []).map((r) => ({
    id: r.id,
    title: r.title,
    client_name: r.client_name,
    token: r.token,
    status: r.status,
    expires_at: r.expires_at,
    view_count: r.view_count ?? 0,
    last_viewed_at: r.last_viewed_at,
    date_created: r.date_created,
    has_password: !!r.password_hash,
    url: `/p/${r.token}`,
  }));

  return { data };
});
