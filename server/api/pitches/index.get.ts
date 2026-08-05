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
        // Linked record (Pursuits merge) — resolve a display label + deep link.
        'client.id', 'client.name',
        'lead.id', 'lead.related_contact.first_name', 'lead.related_contact.last_name',
        'contact.id', 'contact.first_name', 'contact.last_name',
      ],
      sort: ['-date_created'],
      limit: 200,
    }),
  )) as any[];

  const fullName = (f?: string | null, l?: string | null) => `${f || ''} ${l || ''}`.trim();

  const data = (rows || []).map((r) => {
    // Resolve the linked record into a { type, label, to } for the list UI.
    // Priority: client → lead → contact (most concrete first).
    // `value` is the "<type>:<id>" the create/edit form's For picker uses.
    let linked: { type: 'client' | 'lead' | 'contact'; label: string; to: string; value: string } | null = null;
    if (r.client?.id) {
      linked = { type: 'client', label: r.client.name || 'Client', to: `/clients/${r.client.id}`, value: `client:${r.client.id}` };
    } else if (r.lead?.id) {
      linked = {
        type: 'lead',
        label: fullName(r.lead.related_contact?.first_name, r.lead.related_contact?.last_name) || `Lead #${r.lead.id}`,
        to: `/leads/${r.lead.id}`,
        value: `lead:${r.lead.id}`,
      };
    } else if (r.contact?.id) {
      linked = {
        type: 'contact',
        label: fullName(r.contact.first_name, r.contact.last_name) || 'Contact',
        to: `/contacts/${r.contact.id}`,
        value: `contact:${r.contact.id}`,
      };
    }
    return {
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
      linked,
      url: `/p/${r.token}`,
    };
  });

  return { data };
});
