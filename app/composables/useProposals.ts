/**
 * useProposals - Proposal management composable
 */

import type { ProposalFilters, ProposalStatus } from '~~/shared/proposals-enhanced';

export function useProposals() {
  const proposals = useDirectusItems('proposals');
  const leads = useDirectusItems('leads');
  const contactItems = useDirectusItems('contacts');
  const { selectedOrg } = useOrganization();

  /** proposal_status → lead stage for an auto-wrapped pursuit. */
  function stageForProposalStatus(status?: string): string {
    if (status === 'accepted') return 'won';
    if (status === 'rejected' || status === 'expired') return 'lost';
    return 'proposal_sent';
  }

  /**
   * Auto-wrap (Pursuits merge): a lead-less proposal that has a contact or client
   * gets a lightweight lead so it lands on the Opportunities board. Leads key off
   * `related_contact` (there's no in-flight client link), so:
   *   - contact present → wrap on that contact
   *   - client only     → wrap on the client's first contact (skip if none)
   * Dedups against an existing lead for the same contact. Returns the lead id or
   * null. Best-effort: the caller swallows failures so proposal creation is never
   * blocked.
   */
  async function ensurePursuitLead(opts: {
    org: string; contact?: string | null; client?: string | null; status?: string; value?: number | null;
  }): Promise<number | null> {
    let relatedContact = opts.contact || null;
    if (!relatedContact && opts.client) {
      const cs = (await contactItems.list({
        fields: ['id'], filter: { client: { _eq: opts.client } }, sort: ['date_created'], limit: 1,
      }).catch(() => [])) as any[];
      relatedContact = cs?.[0]?.id || null;
    }
    if (!relatedContact) return null; // nothing concrete to hang a pursuit on

    // Reuse an existing lead for this contact rather than spawning a duplicate.
    const existing = (await leads.list({
      fields: ['id'], filter: { organization: { _eq: opts.org }, related_contact: { _eq: relatedContact } }, limit: 1,
    }).catch(() => [])) as any[];
    if (existing?.[0]?.id != null) return existing[0].id;

    const lead = (await leads.create({
      organization: opts.org,
      related_contact: relatedContact,
      stage: stageForProposalStatus(opts.status),
      source: 'proposal',
      ...(opts.value ? { estimated_value: opts.value } : {}),
    } as any)) as any;
    return lead?.id ?? null;
  }

  const getProposals = async (filters?: ProposalFilters) => {
    // Tenant-data safety: the 1 legacy null-org proposal was backfilled
    // 2026-04-20, so this guard no longer hides real data.
    if (!selectedOrg.value) return [];

    const filter: Record<string, any> = {
      organization: { _eq: filters?.organization || selectedOrg.value },
    };

    if (filters?.proposal_status) filter.proposal_status = { _eq: filters.proposal_status };
    if (filters?.date_from) filter.date_created = { _gte: filters.date_from };
    if (filters?.date_to) {
      filter.date_created = { ...filter.date_created, _lte: filters.date_to };
    }

    return await proposals.list({
      fields: [
        '*',
        'organization.id',
        'organization.name',
        'lead.id',
        'lead.status',
        'lead.related_contact.first_name',
        'lead.related_contact.last_name',
        'contact.id',
        'contact.first_name',
        'contact.last_name',
        'contact.email',
        'file.id',
        'file.title',
        'file.type',
      ],
      filter,
      sort: ['-date_created'],
      search: filters?.search || undefined,
      limit: 100,
    });
  };

  const getProposal = async (id: string) => {
    return await proposals.get(id, {
      fields: [
        '*',
        'organization.id',
        'organization.name',
        'organization.logo',
        'organization.address',
        'organization.phone',
        'organization.email',
        'organization.website',
        'organization.plan',
        'organization.whitelabel',
        'organization.active_addons',
        'organization.document_theme',
        'organization.document_accent',
        'organization.document_theme_config',
        'organization.document_page_template',
        'lead.id',
        'lead.status',
        'lead.stage',
        'lead.related_contact.id',
        'lead.related_contact.first_name',
        'lead.related_contact.last_name',
        'lead.related_contact.email',
        'contact.id',
        'contact.first_name',
        'contact.last_name',
        'contact.email',
        'contact.phone',
        'contact.company',
        'file.id',
        'file.title',
        'file.type',
        'file.filesize',
      ],
    });
  };

  const createProposal = async (data: Record<string, any>) => {
    const org = data.organization || selectedOrg.value;
    const created = (await proposals.create({
      ...data,
      organization: org,
      proposal_status: data.proposal_status || 'draft',
    } as any)) as any;

    // Auto-wrap a lead-less proposal into a Pursuit when it has a contact/client.
    if (created?.id && !data.lead && (data.contact || data.client)) {
      try {
        const leadId = await ensurePursuitLead({
          org,
          contact: data.contact,
          client: data.client,
          status: data.proposal_status || 'draft',
          value: Number(data.total_value) || null,
        });
        if (leadId != null) await proposals.update(created.id, { lead: leadId } as any);
      } catch (err) {
        console.warn('[proposals] auto-wrap into pursuit failed (non-blocking):', err);
      }
    }
    return created;
  };

  const updateProposalStatus = async (id: string, status: ProposalStatus) => {
    return await proposals.update(id, { proposal_status: status } as any);
  };

  return {
    getProposals,
    getProposal,
    createProposal,
    updateProposalStatus,
    ...proposals,
  };
}
