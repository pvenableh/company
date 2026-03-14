import type { Client } from '~/types/directus';

/**
 * useClients — Client CRUD + selection state
 *
 * Provides full CRUD operations for the clients collection, plus
 * a selectedClient state for filtering data throughout the app.
 *
 * The client dropdown in the header offers three modes:
 *   1. null   → "All" — no client filter, shows everything
 *   2. "org"  → Organization's own work (items with no client assigned)
 *   3. UUID   → Specific client
 */
export function useClients() {
  const items = useDirectusItems<Client>('clients');
  const { selectedOrg, getOrganizationFilter, currentOrg } = useOrganization();

  // ── Selection state ───────────────────────────────────────────────────────
  const selectedClient = useState<string | null>('selectedClient', () => null);
  const clientList = useState<Client[]>('clientList', () => []);
  const clientsLoading = useState<boolean>('clientsLoading', () => false);

  const clientStorage = useStorageSync('selectedClient', {
    cookie: {
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      sameSite: 'lax',
    },
    priorities: ['cookie', 'localStorage'],
  });

  // ── Client options for the header dropdown ────────────────────────────────
  const clientOptions = computed(() => {
    const orgName = currentOrg.value?.name || 'Organization';
    return [
      { id: null, name: 'All', logo: null },
      { id: 'org', name: orgName, logo: currentOrg.value?.icon || null },
      ...clientList.value,
    ];
  });

  const currentClient = computed(() => {
    if (!selectedClient.value) return null;
    if (selectedClient.value === 'org') {
      return { id: 'org', name: currentOrg.value?.name || 'Organization' } as any;
    }
    return clientList.value.find((c) => c.id === selectedClient.value) || null;
  });

  const hasClients = computed(() => clientList.value.length > 0);

  // ── Selection actions ─────────────────────────────────────────────────────
  function setClient(clientId: string | null) {
    if (clientId !== selectedClient.value) {
      clientStorage.setValue(clientId);
    }
  }

  function clearClient() {
    clientStorage.clearValue();
  }

  /**
   * Returns a Directus filter for the currently selected client.
   *
   *   null  → {} (no filter — show all)
   *   "org" → { client: { _null: true } } (org's own items, no client assigned)
   *   UUID  → { client: { _eq: UUID } }
   */
  function getClientFilter(): Record<string, any> {
    const id = selectedClient.value;
    if (!id) return {};
    if (id === 'org') return { client: { _null: true } };
    return { client: { _eq: id } };
  }

  // ── Fetch active clients for the dropdown ─────────────────────────────────
  async function fetchActiveClients() {
    if (!selectedOrg.value) {
      clientList.value = [];
      return;
    }

    clientsLoading.value = true;
    try {
      const filter: any = {
        _and: [
          { status: { _eq: 'active' } },
          { organization: { _eq: selectedOrg.value } },
        ],
      };

      const data = await items.list({
        fields: ['id', 'name', 'logo', 'status'],
        filter,
        sort: ['name'],
        limit: -1,
      });

      clientList.value = data;

      // Validate current selection — clear if client no longer in list
      if (
        selectedClient.value &&
        selectedClient.value !== 'org' &&
        !data.some((c: Client) => c.id === selectedClient.value)
      ) {
        clearClient();
      }
    } catch (err) {
      console.error('Failed to fetch active clients:', err);
      clientList.value = [];
    } finally {
      clientsLoading.value = false;
    }
  }

  // Restore selection from storage on init
  function tryRestoreSelectedClient() {
    const saved = clientStorage.getValue();
    if (saved && selectedClient.value !== saved) {
      clientStorage.setValue(saved);
    }
  }

  // ── Cross-tab sync ────────────────────────────────────────────────────────
  function setupClientListeners() {
    if (!import.meta.client) return;

    const onStorageChange = (event: StorageEvent) => {
      if (event.key === 'selectedClient') {
        const newValue = event.newValue;
        if (newValue !== selectedClient.value) {
          selectedClient.value = newValue;
        }
      }
    };

    window.addEventListener('storage', onStorageChange);
    return () => window.removeEventListener('storage', onStorageChange);
  }

  // ── Auto-fetch when org changes ───────────────────────────────────────────
  if (import.meta.client) {
    watch(
      () => selectedOrg.value,
      (newOrg) => {
        if (newOrg) {
          fetchActiveClients();
          tryRestoreSelectedClient();
        } else {
          clientList.value = [];
          clearClient();
        }
      },
      { immediate: true }
    );
  }

  // ── CRUD operations ───────────────────────────────────────────────────────

  const getClients = async (params?: {
    status?: string;
    search?: string;
    tags?: string[];
    sort?: string[];
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
        ],
      });
    }

    if (params?.tags?.length) {
      filter._and.push({ tags: { _contains: params.tags[0] } });
    }

    const data = await items.list({
      fields: ['*', 'logo.*', 'primary_contact.first_name', 'primary_contact.last_name', 'primary_contact.email', 'organization.name'],
      filter: filter._and.length ? filter : undefined,
      sort: params?.sort || ['name'],
      limit: params?.limit || 50,
      page: params?.page || 1,
    });

    const total = await items.count(filter._and.length ? filter : undefined);

    return { data, total };
  };

  /**
   * Lightweight sort update — does NOT trigger fetchActiveClients() refetch.
   * Used by drag-and-drop reorder to avoid N refetches.
   */
  const updateClientSort = async (id: string, sort: number): Promise<void> => {
    await items.update(id, { sort } as any);
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
    const result = await items.create({
      ...payload,
      organization: payload.organization || selectedOrg.value,
      status: payload.status || 'active',
    } as any);
    await fetchActiveClients();
    return result;
  };

  const updateClient = async (id: string, payload: Partial<Client>): Promise<Client> => {
    const result = await items.update(id, payload);
    await fetchActiveClients();
    return result;
  };

  const deleteClient = async (id: string): Promise<boolean> => {
    const result = await items.remove(id);
    await fetchActiveClients();
    return result;
  };

  // Get clients for dropdown selection (lightweight) — kept for backward compat
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
    // Selection state
    selectedClient: readonly(selectedClient),
    clientList: readonly(clientList),
    clientsLoading: readonly(clientsLoading),
    clientOptions,
    currentClient,
    hasClients,
    setClient,
    clearClient,
    getClientFilter,
    fetchActiveClients,
    setupClientListeners,

    // CRUD
    getClients,
    getClient,
    createClient,
    updateClient,
    updateClientSort,
    deleteClient,
    getClientOptions,
  };
}
