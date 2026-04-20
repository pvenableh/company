/**
 * useProposals - Proposal management composable
 */

import type { ProposalFilters, ProposalStatus } from '~~/shared/proposals-enhanced';

export function useProposals() {
  const proposals = useDirectusItems('proposals');
  const { selectedOrg } = useOrganization();

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
    return await proposals.create({
      ...data,
      organization: data.organization || selectedOrg.value,
      proposal_status: data.proposal_status || 'draft',
    } as any);
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
