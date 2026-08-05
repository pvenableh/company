/**
 * Auto-wrap (Pursuits merge) — server-side twin of the client-side logic in
 * `useProposals.createProposal`. A lead-less proposal that has a contact or
 * client gets a lightweight lead so it lands on the Opportunities board.
 *
 * Leads key off `related_contact` (there is no in-flight client FK on leads),
 * so: contact present → wrap on that contact; client only → wrap on the client's
 * first contact (skip if it has none). Dedups against an existing lead for the
 * same contact. Returns the lead id (integer PK) or null. Best-effort — callers
 * swallow failures so document creation is never blocked.
 */
import { createItem, readItems } from '@directus/sdk';

/** proposal_status → lead stage for an auto-wrapped pursuit. */
export function stageForProposalStatus(status?: string | null): string {
  if (status === 'accepted') return 'won';
  if (status === 'rejected' || status === 'expired') return 'lost';
  return 'proposal_sent';
}

export async function ensurePursuitLead(
  directus: any,
  opts: { organization: string; contact?: string | null; client?: string | null; status?: string | null; value?: number | null },
): Promise<number | null> {
  let relatedContact = opts.contact || null;

  if (!relatedContact && opts.client) {
    const cs = (await directus.request(readItems('contacts', {
      fields: ['id'], filter: { client: { _eq: opts.client } }, sort: ['date_created'], limit: 1,
    })).catch(() => [])) as any[];
    relatedContact = cs?.[0]?.id || null;
  }
  if (!relatedContact) return null; // nothing concrete to hang a pursuit on

  const existing = (await directus.request(readItems('leads', {
    fields: ['id'], filter: { organization: { _eq: opts.organization }, related_contact: { _eq: relatedContact } }, limit: 1,
  })).catch(() => [])) as any[];
  if (existing?.[0]?.id != null) return existing[0].id;

  const lead = (await directus.request(createItem('leads', {
    organization: opts.organization,
    related_contact: relatedContact,
    stage: stageForProposalStatus(opts.status),
    source: 'proposal',
    ...(opts.value ? { estimated_value: opts.value } : {}),
  } as any)).catch(() => null)) as any;
  return lead?.id ?? null;
}
