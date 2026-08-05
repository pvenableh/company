/**
 * Pickable records a pitch can be linked to (Phase 3 of the Pursuits merge).
 * Returns minimal id + label lists of the org's clients, leads, and contacts so
 * the /pitches create form can attach a pitch to a real record instead of a
 * free-text name. Org-scoped, gated behind the same `proposals` feature the rest
 * of the pitch endpoints use.
 *
 * NB org-scoping differs per collection: leads/clients scope on a direct
 * `organization` m2o; contacts scope through the `organizations` m2m junction
 * (`organizations.organizations_id`). leads.id is an integer PK.
 */
import { readItems } from '@directus/sdk';
import { requireOrgPermission } from '~~/server/utils/org-permissions';

const LIMIT = 300;

export default defineEventHandler(async (event) => {
  const organization = String(getQuery(event).organization || '');
  if (!organization) throw createError({ statusCode: 400, message: 'organization is required' });

  await requireOrgPermission(event, organization, 'proposals', 'read');

  const directus = getServerDirectus();

  const [clients, leads, contacts] = await Promise.all([
    directus.request(readItems('clients', {
      filter: { organization: { _eq: organization } },
      fields: ['id', 'name'],
      sort: ['name'],
      limit: LIMIT,
    })) as Promise<any[]>,
    directus.request(readItems('leads', {
      filter: { organization: { _eq: organization } },
      fields: ['id', 'related_contact.first_name', 'related_contact.last_name'],
      sort: ['-date_created'],
      limit: LIMIT,
    })) as Promise<any[]>,
    directus.request(readItems('contacts', {
      filter: { organizations: { organizations_id: { _eq: organization } } },
      fields: ['id', 'first_name', 'last_name', 'company'],
      sort: ['first_name'],
      limit: LIMIT,
    })) as Promise<any[]>,
  ]);

  const fullName = (f?: string | null, l?: string | null) => `${f || ''} ${l || ''}`.trim();

  return {
    clients: (clients || [])
      .filter((c) => c.name)
      .map((c) => ({ id: c.id, label: c.name })),
    leads: (leads || []).map((l) => ({
      id: l.id,
      label: fullName(l.related_contact?.first_name, l.related_contact?.last_name) || `Lead #${l.id}`,
    })),
    contacts: (contacts || []).map((c) => {
      const name = fullName(c.first_name, c.last_name) || 'Unnamed contact';
      return { id: c.id, label: c.company ? `${name} · ${c.company}` : name };
    }),
  };
});
