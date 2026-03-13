import type { Client } from '~/types/directus';

export function useClients() {
  const items = useDirectusItems<Client>('clients');
  const { selectedOrg, getOrganizationFilter } = useOrganization();

  const getClients = async (params?: {
    status?: string;
    search?: string;
    tags?: string[];
    limit?: number;
    page?: number;
  }): Promise<{ data: Client[]; total: number }> => {
    const filter: any = { _and: [] };

    // Always org-scoped
    const orgFilter = getOrganizationFilter();
    if (orgFilter?.organization) {
      filter._and.push({ organization: orgFilter.organization });
    }

    if (params?.status) {
      filter._and.push({ status: { _eq: params.status } });
    }

    if (params?.search) {
      filter._and.push({
        _or: [
          { name: { _icontains: params.search } },
          { website: { _icontains: params.search } },
          { industry: { _icontains: params.search } },
        ],
      });
    }

    if (params?.tags?.length) {
      filter._and.push({ tags: { _contains: params.tags[0] } });
    }

    const data = await items.list({
      fields: ['*', 'logo.*', 'primary_contact.first_name', 'primary_contact.last_name', 'primary_contact.email', 'organization.name'],
      filter: filter._and.length ? filter : undefined,
      sort: ['name'],
      limit: params?.limit || 50,
      page: params?.page || 1,
    });

    const total = await items.count(filter._and.length ? filter : undefined);

    return { data, total };
  };

  const getClient = async (id: string): Promise<Client> => {
    return items.get(id, {
      fields: [
        '*',
        'logo.*',
        'primary_contact.*',
        'organization.name',
        'organization.id',
        'contacts.id',
        'contacts.first_name',
        'contacts.last_name',
        'contacts.email',
        'contacts.phone',
        'projects.id',
        'projects.title',
        'projects.status',
        'tickets.id',
        'tickets.title',
        'tickets.status',
        'invoices.id',
        'invoices.invoice_code',
        'invoices.status',
        'invoices.total_amount',
      ],
    });
  };

  const createClient = async (payload: Partial<Client>): Promise<Client> => {
    return items.create({
      ...payload,
      organization: payload.organization || selectedOrg.value,
      status: payload.status || 'active',
    } as any);
  };

  const updateClient = async (id: string, payload: Partial<Client>): Promise<Client> => {
    return items.update(id, payload);
  };

  const deleteClient = async (id: string): Promise<boolean> => {
    return items.remove(id);
  };

  // Get clients for dropdown selection (lightweight)
  const getClientOptions = async (): Promise<{ label: string; value: string }[]> => {
    const filter: any = { _and: [{ status: { _in: ['active', 'prospect'] } }] };
    const orgFilter = getOrganizationFilter();
    if (orgFilter?.organization) {
      filter._and.push({ organization: orgFilter.organization });
    }

    const data = await items.list({
      fields: ['id', 'name', 'status'],
      filter,
      sort: ['name'],
      limit: -1,
    });

    return data.map((c: Client) => ({
      label: c.name,
      value: c.id,
    }));
  };

  return {
    getClients,
    getClient,
    createClient,
    updateClient,
    deleteClient,
    getClientOptions,
  };
}
