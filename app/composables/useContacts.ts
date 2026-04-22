import type { Contact, CreateContactPayload } from '~~/shared/email/contacts';

export function useContacts() {
  const items = useDirectusItems<Contact>('contacts');
  const memberItems = useDirectusItems('mailing_list_contacts');
  const junctionItems = useDirectusItems('contacts_organizations');
  const { selectedOrg, getOrganizationFilter } = useOrganization();

  // ── Contact CRUD ──────────────────────────────────────────────────
  const getContacts = async (params?: {
    status?: string;
    search?: string;
    tags?: string[];
    industry?: string;
    client?: string;
    limit?: number;
    page?: number;
  }): Promise<{ data: Contact[]; total: number }> => {
    // Tenant-data safety: never query without an org. Without this guard,
    // an empty/implicit filter would return every org's contacts.
    if (!selectedOrg.value) {
      return { data: [], total: 0 };
    }

    const filter: any = {
      _and: [
        {
          organizations: {
            organizations_id: { _eq: selectedOrg.value },
          },
        },
      ],
    };

    if (params?.status) {
      filter._and.push({ status: { _eq: params.status } });
    } else {
      filter._and.push({ status: { _neq: 'archived' } });
    }

    if (params?.search) {
      filter._and.push({
        _or: [
          { first_name: { _icontains: params.search } },
          { last_name: { _icontains: params.search } },
          { email: { _icontains: params.search } },
          { company: { _icontains: params.search } },
        ],
      });
    }

    if (params?.industry) {
      filter._and.push({ industry: { _eq: params.industry } });
    }

    if (params?.tags?.length) {
      filter._and.push({ tags: { _contains: params.tags[0] } });
    }

    // Filter by client association
    if (params?.client) {
      filter._and.push({ client: { _eq: params.client } });
    }

    const data = await items.list({
      fields: ['*', 'client.id', 'client.name'],
      filter: filter._and.length ? filter : undefined,
      sort: ['last_name', 'first_name'],
      limit: params?.limit || 50,
      page: params?.page || 1,
    });

    const total = await items.count(filter._and.length ? filter : undefined);

    return { data, total };
  };

  const getContact = async (id: string): Promise<Contact> => {
    return items.get(id, {
      fields: ['*', 'lists.id', 'lists.list_id.*', 'lists.subscribed', 'client.id', 'client.name', 'organizations.id', 'organizations.organizations_id.id', 'organizations.organizations_id.name', 'leads.id', 'leads.stage', 'leads.status', 'leads.project_type', 'leads.is_junk', 'leads.next_follow_up', 'leads.estimated_value'],
    });
  };

  const createContact = async (payload: CreateContactPayload): Promise<Contact> => {
    const contact = await items.create({
      ...payload,
      status: 'published',
      email_subscribed: true,
      unsubscribe_token: crypto.randomUUID(),
      source: payload.source || 'manual',
    } as any);

    // Auto-link to current org via junction
    if (selectedOrg.value && contact?.id) {
      try {
        await junctionItems.create({
          contacts_id: contact.id,
          organizations_id: selectedOrg.value,
        });
      } catch (err) {
        console.warn('Failed to link contact to org (non-fatal):', err);
      }
    }

    return contact;
  };

  const updateContact = async (id: string, payload: Partial<Contact>): Promise<Contact> => {
    return items.update(id, payload);
  };

  const deleteContact = async (id: string): Promise<boolean> => {
    return items.remove(id);
  };

  const unsubscribeContact = async (id: string): Promise<void> => {
    await updateContact(id, {
      email_subscribed: false,
      email_unsubscribed_at: new Date().toISOString(),
    } as any);
  };

  // ── Client association ──────────────────────────────────────────────
  const linkToClient = async (contactId: string, clientId: string | null): Promise<void> => {
    await updateContact(contactId, { client: clientId } as any);
  };

  // ── Tag management ────────────────────────────────────────────────
  const addTag = async (id: string, tag: string, contact: Contact): Promise<void> => {
    const tags = [...(contact.tags || [])];
    if (!tags.includes(tag)) {
      await updateContact(id, { tags: [...tags, tag] } as any);
    }
  };

  const removeTag = async (id: string, tag: string, contact: Contact): Promise<void> => {
    await updateContact(id, {
      tags: (contact.tags || []).filter((t) => t !== tag),
    } as any);
  };

  // ── Mailing list membership ───────────────────────────────────────
  const addToList = async (contactId: string, listId: number, source = 'manual'): Promise<void> => {
    const existing = await memberItems.list({
      filter: {
        _and: [
          { contact_id: { _eq: contactId } },
          { list_id: { _eq: listId } },
        ],
      },
      limit: 1,
    });

    if (existing?.length > 0) {
      if (!(existing[0] as any).subscribed) {
        await memberItems.update((existing[0] as any).id, {
          subscribed: true,
          date_subscribed: new Date().toISOString(),
          date_unsubscribed: null,
        });
      }
      return;
    }

    await memberItems.create({
      contact_id: contactId,
      list_id: listId,
      subscribed: true,
      date_subscribed: new Date().toISOString(),
      source,
    });
  };

  const removeFromList = async (contactId: string, listId: number): Promise<void> => {
    const existing = await memberItems.list({
      filter: {
        _and: [
          { contact_id: { _eq: contactId } },
          { list_id: { _eq: listId } },
        ],
      },
      limit: 1,
    });

    if (existing?.length > 0) {
      await memberItems.update((existing[0] as any).id, {
        subscribed: false,
        date_unsubscribed: new Date().toISOString(),
      });
    }
  };

  return {
    getContacts,
    getContact,
    createContact,
    updateContact,
    deleteContact,
    unsubscribeContact,
    linkToClient,
    addTag,
    removeTag,
    addToList,
    removeFromList,
  };
}
