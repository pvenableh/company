import type { Client } from '~~/shared/directus';

/**
 * useClients — Client CRUD + selection state + role-based access control
 *
 * Provides full CRUD operations for the clients collection, plus
 * a selectedClient state for filtering data throughout the app.
 *
 * Access model:
 *   - Owner/Admin       → all clients in org
 *   - Manager/Member    → union of (team-assigned clients + individually-assigned clients)
 *   - Client-role user  → their scoped client only
 *
 * The client dropdown in the header offers three modes:
 *   1. null   → "All" — no client filter, shows everything the user can see
 *   2. "org"  → Organization's own work (items with no client assigned)
 *   3. UUID   → Specific client
 */
export function useClients() {
  const items = useDirectusItems<Client>('clients');
  const clientTeamsItems = useDirectusItems('clients_teams');
  const clientUsersItems = useDirectusItems('clients_directus_users');
  const { selectedOrg, getOrganizationFilter, currentOrg } = useOrganization();
  const { isOrgAdminOrAbove, clientScope, loading: roleLoading, fetchMembership } = useOrgRole();
  const { user } = useDirectusAuth();

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

  // ── Sort mode (shared across header dropdown + page table + all forms) ────
  // `manual`   → respect the numeric `sort` field (drag-and-drop on /apps/clients)
  // `activity` → most recently touched first (`date_updated` desc). This is a
  //              proxy for activity — it bumps on direct edits + status changes
  //              but not when child rows (projects/tickets/messages) change.
  type ClientsSortMode = 'manual' | 'activity';
  const clientsSortMode = useCookie<ClientsSortMode>('clients-sort-mode', {
    default: () => 'manual',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
  });

  function setClientsSortMode(next: ClientsSortMode) {
    clientsSortMode.value = next;
  }

  function getClientsSortFields(): string[] {
    // `last_activity_at` is the denormalized max(client.date_updated,
    // children.date_updated) maintained by setup-client-activity.ts (field
    // + 3 Directus flows + /api/clients/bump-activity endpoint). Single
    // indexed column → server can sort cheaply.
    return clientsSortMode.value === 'activity'
      ? ['-last_activity_at', '-date_updated', 'name']
      : ['sort', 'name'];
  }

  /**
   * Pushes `clients.last_activity_at = NOW` on the given clients via the
   * server endpoint (admin token, 5s server-side debounce). Use from any
   * bulk-write callsite that wants to coalesce N child writes into a
   * single client PATCH per affected client.
   */
  async function bumpClientActivity(clientIds: string[]): Promise<{ bumped: number }> {
    const ids = (clientIds || []).filter(Boolean);
    if (!ids.length) return { bumped: 0 };
    try {
      return await $fetch('/api/clients/bump-activity', {
        method: 'POST',
        body: { clientIds: ids },
      });
    } catch (err) {
      console.warn('bumpClientActivity failed:', err);
      return { bumped: 0 };
    }
  }

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

  // ── Accessible client IDs cache (for role-based filtering) ────────────────
  const accessibleClientIds = useState<string[] | null>('accessibleClientIds', () => null);

  /**
   * Fetch the set of client IDs the current user can access.
   * Returns null if user has full access (owner/admin), otherwise returns an array of IDs.
   */
  async function fetchAccessibleClientIds(): Promise<string[] | null> {
    // Wait for org role to finish loading before checking permissions
    if (roleLoading.value) {
      await new Promise<void>((resolve) => {
        const stop = watch(roleLoading, (val) => {
          if (!val) {
            stop();
            resolve();
          }
        }, { immediate: true });
      });
    }

    // Owner/Admin always sees all
    if (isOrgAdminOrAbove.value) {
      accessibleClientIds.value = null;
      return null;
    }

    // Client-role user: scoped to their single client
    if (clientScope.value) {
      accessibleClientIds.value = [clientScope.value];
      return [clientScope.value];
    }

    const userId = user.value?.id;
    if (!userId) {
      accessibleClientIds.value = [];
      return [];
    }

    const ids = new Set<string>();

    try {
      // 1. Get clients assigned to user's teams
      // First get user's team IDs
      const junctionItems = useDirectusItems('junction_directus_users_teams');
      const userTeams = await junctionItems.list({
        filter: { directus_users_id: { _eq: userId } },
        fields: ['teams_id'],
        limit: -1,
      });
      const teamIds = userTeams
        .map((j: any) => typeof j.teams_id === 'object' ? j.teams_id?.id : j.teams_id)
        .filter(Boolean);

      if (teamIds.length > 0) {
        // Get clients assigned to those teams
        const teamClients = await clientTeamsItems.list({
          filter: { teams_id: { _in: teamIds } },
          fields: ['clients_id'],
          limit: -1,
        });
        for (const tc of teamClients) {
          const cid = typeof tc.clients_id === 'object' ? tc.clients_id?.id : tc.clients_id;
          if (cid) ids.add(cid);
        }
      }

      // 2. Get clients assigned directly to this user
      const userClients = await clientUsersItems.list({
        filter: { directus_users_id: { _eq: userId } },
        fields: ['clients_id'],
        limit: -1,
      });
      for (const uc of userClients) {
        const cid = typeof uc.clients_id === 'object' ? uc.clients_id?.id : uc.clients_id;
        if (cid) ids.add(cid);
      }
    } catch (err) {
      console.warn('Failed to fetch accessible client IDs, falling back to all:', err);
      accessibleClientIds.value = null;
      return null;
    }

    const result = [...ids];
    accessibleClientIds.value = result;
    return result;
  }

  // ── Fetch active clients for the dropdown ─────────────────────────────────
  async function fetchActiveClients() {
    if (!selectedOrg.value) {
      clientList.value = [];
      return;
    }

    clientsLoading.value = true;
    try {
      // First resolve which clients this user can see
      const allowedIds = await fetchAccessibleClientIds();

      const filter: any = {
        _and: [
          { account_state: { _eq: 'active' } },
          // Archiving a client only flips `status`, not `account_state`, so
          // an archived row can still have account_state='active'. Require
          // status='published' here so the header dropdown matches the
          // page's Active tab.
          { status: { _eq: 'published' } },
          { organization: { _eq: selectedOrg.value } },
        ],
      };

      // If user has restricted access, add an ID filter
      if (allowedIds !== null) {
        if (allowedIds.length === 0) {
          // User has no client assignments — show empty list
          clientList.value = [];
          clientsLoading.value = false;
          return;
        }
        filter._and.push({ id: { _in: allowedIds } });
      }

      const data = await items.list({
        fields: ['id', 'name', 'logo', 'status', 'account_state', 'sort', 'date_updated', 'last_activity_at'],
        filter,
        sort: getClientsSortFields(),
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

    // Refetch the header dropdown when the sort mode flips so the order
    // matches whatever surface the user just toggled on /apps/clients.
    watch(
      () => clientsSortMode.value,
      () => {
        if (selectedOrg.value) fetchActiveClients();
      }
    );
  }

  // ── CRUD operations ───────────────────────────────────────────────────────

  const getClients = async (params?: {
    status?: string;
    accountState?: string;
    search?: string;
    tags?: string[];
    sort?: string[];
    limit?: number;
    page?: number;
  }): Promise<{ data: Client[]; total: number }> => {
    if (!selectedOrg.value) return { data: [], total: 0 };

    const filter: any = { _and: [{ organization: { _eq: selectedOrg.value } }] };

    // Role-based access control: restrict to assigned clients for non-admins
    const allowedIds = accessibleClientIds.value;
    if (allowedIds !== null) {
      if (allowedIds.length === 0) {
        return { data: [], total: 0 };
      }
      filter._and.push({ id: { _in: allowedIds } });
    }

    if (params?.status) {
      filter._and.push({ status: { _eq: params.status } });
    }

    if (params?.accountState) {
      filter._and.push({ account_state: { _eq: params.accountState } });
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

    const [data, total] = await Promise.all([
      items.list({
        fields: ['*', 'logo.*', 'primary_contact.first_name', 'primary_contact.last_name', 'primary_contact.email', 'organization.name'],
        filter: filter._and.length ? filter : undefined,
        sort: params?.sort || getClientsSortFields(),
        limit: params?.limit || 50,
        page: params?.page || 1,
      }),
      items.count(filter._and.length ? filter : undefined),
    ]);

    return { data, total };
  };

  /**
   * Count clients matching the same filter shape as getClients(), but skips
   * the row fetch entirely. Used by tab badges where the row payload would
   * be discarded anyway. Cuts the per-tab cost from (list + count) to just
   * a single aggregate request.
   */
  const getClientCount = async (params?: {
    status?: string;
    accountState?: string;
  }): Promise<number> => {
    if (!selectedOrg.value) return 0;
    const filter: any = { _and: [{ organization: { _eq: selectedOrg.value } }] };
    const allowedIds = accessibleClientIds.value;
    if (allowedIds !== null) {
      if (allowedIds.length === 0) return 0;
      filter._and.push({ id: { _in: allowedIds } });
    }
    if (params?.status) filter._and.push({ status: { _eq: params.status } });
    if (params?.accountState) filter._and.push({ account_state: { _eq: params.accountState } });
    return items.count(filter);
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
        'industry.id',
        'industry.name',
        'industry.class',
        'parent_client.id',
        'parent_client.name',
        'parent_client.parent_client',
        'contacts.id',
        'contacts.first_name',
        'contacts.last_name',
        'contacts.email',
        'contacts.phone',
        'contacts.title',
        'contacts.category',
        'contacts.is_billing_contact',
        'contacts.sort',
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
        'partner_connections.id',
        'partner_connections.role',
        'partner_connections.introduced_by',
        'partner_connections.notes',
        'partner_connections.contact.id',
        'partner_connections.contact.first_name',
        'partner_connections.contact.last_name',
        'partner_connections.contact.email',
        'partner_connections.contact.category',
        'partner_connections.contact.company',
      ],
    });
  };

  const folderItems = useDirectusItems('directus_folders');

  /**
   * Ensure a slug is unique within the org by appending -2, -3, etc. if needed.
   */
  const ensureUniqueSlug = async (slug: string, orgId: string, excludeId?: string): Promise<string> => {
    if (!slug) return '';
    let candidate = slug;
    let suffix = 2;
    while (true) {
      const filter: any = {
        _and: [
          { slug: { _eq: candidate } },
          { organization: { _eq: orgId } },
        ],
      };
      if (excludeId) {
        filter._and.push({ id: { _neq: excludeId } });
      }
      const existing = await items.list({ filter, fields: ['id'], limit: 1 });
      if (existing.length === 0) return candidate;
      candidate = `${slug}-${suffix}`;
      suffix++;
    }
  };

  const createClient = async (payload: Partial<Client>): Promise<Client> => {
    const orgId = payload.organization || selectedOrg.value;

    // Auto-deduplicate slug
    if (payload.slug && orgId) {
      payload.slug = await ensureUniqueSlug(payload.slug, orgId as string);
    }

    const result = await items.create({
      ...payload,
      organization: orgId,
      status: payload.status || 'published',
      account_state: (payload as any).account_state || 'active',
      // Seed activity so a brand-new client ranks above existing zero-activity
      // rows in Recent sort. The 3 child-collection flows will keep this in
      // sync going forward.
      last_activity_at: (payload as any).last_activity_at || new Date().toISOString(),
    } as any);

    // Auto-create a folder for this client under the org's Clients/ subfolder
    if (result && (result as any).id && payload.name) {
      try {
        let parentFolderId: string | null = null;
        if (orgId && currentOrg.value?.folder) {
          const orgFolderId = typeof currentOrg.value.folder === 'object'
            ? (currentOrg.value.folder as any).id
            : currentOrg.value.folder;

          // Find the Clients subfolder under the org root
          const { getChildren } = useFolders();
          const children = await getChildren(orgFolderId);
          const clientsSubfolder = children.find(f => f.name === 'Clients');
          parentFolderId = clientsSubfolder?.id || orgFolderId;
        }

        const folder = await folderItems.create({
          name: payload.name,
          parent: parentFolderId,
        } as any);

        // Link folder to client
        if (folder && (folder as any).id) {
          await items.update((result as any).id, { folder: (folder as any).id } as any);
        }
      } catch (e) {
        console.warn('Failed to create client folder:', e);
      }
    }

    await fetchActiveClients();
    return result;
  };

  const updateClient = async (id: string, payload: Partial<Client>): Promise<Client> => {
    // Auto-deduplicate slug on update
    if (payload.slug && selectedOrg.value) {
      payload.slug = await ensureUniqueSlug(payload.slug, selectedOrg.value, id);
    }
    // Direct client edits (status change, name, notes, etc.) are activity
    // too — child flows only cover project/ticket/task writes. Stamp here
    // instead of via a clients.update flow, which would loop on itself.
    // Sort drag-and-drop sends just `{ sort: N }` via updateClientSort and
    // intentionally bypasses this — re-ordering isn't activity.
    const result = await items.update(id, {
      ...payload,
      last_activity_at: (payload as any).last_activity_at || new Date().toISOString(),
    } as any);
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
    if (!selectedOrg.value) return [];
    const filter: any = {
      _and: [
        { account_state: { _in: ['active', 'prospect'] } },
        // Same archive-leak guard as fetchActiveClients — archived rows
        // can still have account_state='active'|'prospect'.
        { status: { _eq: 'published' } },
        { organization: { _eq: selectedOrg.value } },
      ],
    };

    // Role-based access control
    const allowedIds = accessibleClientIds.value;
    if (allowedIds !== null) {
      if (allowedIds.length === 0) return [];
      filter._and.push({ id: { _in: allowedIds } });
    }

    const data = await items.list({
      fields: ['id', 'name', 'status', 'account_state', 'last_activity_at'],
      filter,
      sort: getClientsSortFields(),
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

    // Sort mode (shared across header dropdown + page + every consumer)
    clientsSortMode,
    setClientsSortMode,
    getClientsSortFields,
    bumpClientActivity,

    // Access control
    accessibleClientIds: readonly(accessibleClientIds),
    fetchAccessibleClientIds,

    // CRUD
    getClients,
    getClientCount,
    getClient,
    createClient,
    updateClient,
    updateClientSort,
    deleteClient,
    getClientOptions,
  };
}
