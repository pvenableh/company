import type { ContactConnection, Client } from '~~/shared/directus';

export type ContactConnectionRole = ContactConnection['role'];
export type ContactConnectionIntroducedBy = NonNullable<ContactConnection['introduced_by']>;

export const CONNECTION_ROLE_LABELS: Record<ContactConnectionRole, string> = {
  referral_partner: 'Referral Partner',
  vendor: 'Vendor',
  board: 'Board Member',
  consultant: 'Consultant',
  investor: 'Investor',
  other: 'Other',
};

export const CONNECTION_ROLE_OPTIONS: Array<{ value: ContactConnectionRole; label: string }> = [
  { value: 'referral_partner', label: 'Referral Partner' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'board', label: 'Board Member' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'investor', label: 'Investor' },
  { value: 'other', label: 'Other' },
];

export const INTRODUCED_BY_OPTIONS: Array<{ value: ContactConnectionIntroducedBy; label: string }> = [
  { value: 'partner', label: 'Partner introduced us' },
  { value: 'us', label: 'We introduced them' },
];

export function useContactConnections() {
  const items = useDirectusItems<ContactConnection>('contact_connections');
  const clientItems = useDirectusItems('clients');

  const listForContact = async (contactId: string): Promise<ContactConnection[]> => {
    return items.list({
      filter: { contact: { _eq: contactId } },
      fields: [
        '*',
        'client.id', 'client.name', 'client.logo', 'client.account_state',
      ],
      sort: ['-date_created'],
      limit: -1,
    }) as Promise<ContactConnection[]>;
  };

  const listForClient = async (clientId: string): Promise<ContactConnection[]> => {
    return items.list({
      filter: { client: { _eq: clientId } },
      fields: [
        '*',
        'contact.id', 'contact.first_name', 'contact.last_name', 'contact.email', 'contact.company', 'contact.category',
      ],
      sort: ['-date_created'],
      limit: -1,
    }) as Promise<ContactConnection[]>;
  };

  const createConnection = async (payload: {
    contact: string;
    client: string;
    role: ContactConnectionRole;
    introduced_by?: ContactConnectionIntroducedBy | null;
    notes?: string | null;
  }): Promise<ContactConnection> => {
    return items.create(payload as any);
  };

  const updateConnection = async (id: number | string, payload: Partial<ContactConnection>): Promise<ContactConnection> => {
    return items.update(id as any, payload as any);
  };

  const deleteConnection = async (id: number | string): Promise<boolean> => {
    return items.remove(id as any);
  };

  // Walk the parent_client chain up to a depth cap, collecting parent client IDs.
  // Returns ancestors in order: [direct parent, grandparent, ...].
  // The input client's own ID is NOT included.
  const getAncestorClientIds = async (
    startClientId: string,
    maxDepth = 3,
  ): Promise<Array<{ id: string; name: string }>> => {
    const ancestors: Array<{ id: string; name: string }> = [];
    let currentId: string | null = startClientId;
    const seen = new Set<string>([startClientId]);

    for (let depth = 0; depth < maxDepth; depth++) {
      if (!currentId) break;
      try {
        const c = await clientItems.get(currentId, { fields: ['id', 'name', 'parent_client'] }) as any;
        const parent = c?.parent_client;
        const parentId = typeof parent === 'string' ? parent : parent?.id;
        if (!parentId || seen.has(parentId)) break;
        seen.add(parentId);
        // Fetch the parent's name for the badge.
        const parentRow = await clientItems.get(parentId, { fields: ['id', 'name'] }) as any;
        if (parentRow?.id) {
          ancestors.push({ id: parentRow.id, name: parentRow.name || 'Unknown' });
          currentId = parentId;
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    return ancestors;
  };

  return {
    listForContact,
    listForClient,
    createConnection,
    updateConnection,
    deleteConnection,
    getAncestorClientIds,
  };
}
