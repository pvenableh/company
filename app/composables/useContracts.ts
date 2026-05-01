/**
 * useContracts — list/get/create/update org-scoped contracts. Mirrors
 * useProposals; signing happens server-side via /api/contracts/sign.
 */

import type { ContractFilters, ContractStatus } from '~~/shared/contracts';

export function useContracts() {
  const contracts = useDirectusItems('contracts');
  const { selectedOrg } = useOrganization();

  const getContracts = async (filters?: ContractFilters) => {
    if (!selectedOrg.value) return [];

    const filter: Record<string, any> = {
      organization: { _eq: filters?.organization || selectedOrg.value },
    };

    if (filters?.contract_status) filter.contract_status = { _eq: filters.contract_status };
    if (filters?.date_from) filter.date_created = { _gte: filters.date_from };
    if (filters?.date_to) {
      filter.date_created = { ...filter.date_created, _lte: filters.date_to };
    }

    return await contracts.list({
      fields: [
        '*',
        'organization.id', 'organization.name',
        'contact.id', 'contact.first_name', 'contact.last_name', 'contact.email', 'contact.company',
        'lead.id', 'lead.status',
        'proposal.id', 'proposal.title',
      ],
      filter,
      sort: ['-date_created'],
      search: filters?.search || undefined,
      limit: 100,
    });
  };

  const getContract = async (id: string) => {
    return await contracts.get(id, {
      fields: [
        '*',
        'organization.id', 'organization.name', 'organization.logo',
        'organization.address', 'organization.phone', 'organization.email', 'organization.website',
        'organization.plan', 'organization.whitelabel',
        'contact.id', 'contact.first_name', 'contact.last_name', 'contact.email', 'contact.phone', 'contact.company',
        'lead.id', 'lead.status',
        'proposal.id', 'proposal.title',
      ],
    });
  };

  const createContract = async (data: Record<string, any>) => {
    return await contracts.create({
      ...data,
      organization: data.organization || selectedOrg.value,
      contract_status: data.contract_status || 'draft',
    } as any);
  };

  const updateContractStatus = async (id: string, status: ContractStatus) => {
    return await contracts.update(id, { contract_status: status } as any);
  };

  return {
    getContracts,
    getContract,
    createContract,
    updateContractStatus,
    ...contracts,
  };
}
