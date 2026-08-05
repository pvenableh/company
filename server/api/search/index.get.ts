/**
 * Org-wide entity search (the header Spotlight's data source for records).
 *
 * Runs parallel `_icontains` queries across the caller's active organizations
 * and returns grouped, deep-linkable hits (clients, contacts, leads, projects,
 * tickets, proposals). Mirrors the org-scoping in `messages/search.get.ts`:
 * admin client + explicit `{ organization: { _in: orgIds } }` filter, resolved
 * from `getUserOrgIds`.
 *
 * Contacts scope through the `organizations` m2m junction; everything else has a
 * direct `organization` m2o. Invoices are omitted (no direct org field — they
 * scope via client, which needs a join). Each group is capped so one noisy
 * collection can't crowd the results.
 */
import { readItems } from '@directus/sdk';
import { getUserOrgIds } from '~~/server/utils/channel-members';

const PER_GROUP = 6;

type Hit = { id: string | number; name: string; description: string; to: string };
type Group = { key: string; label: string; icon: string; items: Hit[] };

const fullName = (f?: string | null, l?: string | null) => `${f || ''} ${l || ''}`.trim();
const icontains = (fields: string[], q: string) => ({ _or: fields.map((f) => ({ [f]: { _icontains: q } })) });

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const q = (getQuery(event).q?.toString() ?? '').trim();
  if (q.length < 2) return { query: q, groups: [] as Group[] };

  const orgIds = await getUserOrgIds(userId);
  if (!orgIds.length) return { query: q, groups: [] as Group[] };

  const directus = getTypedDirectus();
  const org = { organization: { _in: orgIds } };

  const [clients, contacts, leads, projects, tickets, proposals] = await Promise.all([
    directus.request(readItems('clients', {
      filter: { _and: [org, icontains(['name', 'billing_name'], q)] },
      fields: ['id', 'name'], limit: PER_GROUP, sort: ['name'],
    })).catch(() => []),
    directus.request(readItems('contacts', {
      filter: { _and: [{ organizations: { organizations_id: { _in: orgIds } } }, icontains(['first_name', 'last_name', 'email', 'company'], q)] },
      fields: ['id', 'first_name', 'last_name', 'company', 'email'], limit: PER_GROUP,
    })).catch(() => []),
    directus.request(readItems('leads', {
      filter: { _and: [org, { _or: [
        { related_contact: { first_name: { _icontains: q } } },
        { related_contact: { last_name: { _icontains: q } } },
        { project_type: { _icontains: q } },
      ] }] },
      fields: ['id', 'stage', 'project_type', 'related_contact.first_name', 'related_contact.last_name'], limit: PER_GROUP, sort: ['-date_created'],
    })).catch(() => []),
    directus.request(readItems('projects', {
      filter: { _and: [org, icontains(['title'], q)] },
      fields: ['id', 'title', 'status'], limit: PER_GROUP, sort: ['-date_created'],
    })).catch(() => []),
    directus.request(readItems('tickets', {
      filter: { _and: [org, icontains(['title'], q)] },
      fields: ['id', 'title', 'status'], limit: PER_GROUP, sort: ['-date_created'],
    })).catch(() => []),
    directus.request(readItems('proposals', {
      filter: { _and: [org, icontains(['title'], q)] },
      fields: ['id', 'title', 'proposal_status'], limit: PER_GROUP, sort: ['-date_created'],
    })).catch(() => []),
  ]) as any[][];

  const groups: Group[] = [
    {
      key: 'clients', label: 'Clients', icon: 'lucide:building-2',
      items: (clients || []).map((c) => ({ id: c.id, name: c.name || 'Untitled client', description: 'Client', to: `/clients/${c.id}` })),
    },
    {
      key: 'contacts', label: 'Contacts', icon: 'lucide:user',
      items: (contacts || []).map((c) => ({
        id: c.id,
        name: fullName(c.first_name, c.last_name) || c.email || 'Unnamed contact',
        description: c.company || c.email || 'Contact',
        to: `/contacts/${c.id}`,
      })),
    },
    {
      key: 'leads', label: 'Opportunities', icon: 'lucide:target',
      items: (leads || []).map((l) => ({
        id: l.id,
        name: fullName(l.related_contact?.first_name, l.related_contact?.last_name) || l.project_type || `Lead #${l.id}`,
        description: l.stage ? `Opportunity · ${String(l.stage).replace(/_/g, ' ')}` : 'Opportunity',
        to: `/leads/${l.id}`,
      })),
    },
    {
      key: 'projects', label: 'Projects', icon: 'lucide:folder-kanban',
      items: (projects || []).map((p) => ({ id: p.id, name: p.title || 'Untitled project', description: p.status ? `Project · ${p.status}` : 'Project', to: `/projects/${p.id}` })),
    },
    {
      key: 'tickets', label: 'Tickets', icon: 'lucide:ticket',
      items: (tickets || []).map((t) => ({ id: t.id, name: t.title || 'Untitled ticket', description: t.status ? `Ticket · ${t.status}` : 'Ticket', to: `/tickets/${t.id}` })),
    },
    {
      key: 'proposals', label: 'Proposals', icon: 'lucide:file-text',
      items: (proposals || []).map((p) => ({ id: p.id, name: p.title || 'Untitled proposal', description: p.proposal_status ? `Proposal · ${p.proposal_status}` : 'Proposal', to: `/proposals/${p.id}` })),
    },
  ].filter((g) => g.items.length);

  return { query: q, groups };
});
