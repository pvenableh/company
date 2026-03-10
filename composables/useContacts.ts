import type { Contact, CreateContactPayload } from '~/types/email/contacts';

export function useContacts() {
  const items = useDirectusItems<Contact>('contacts');
  const memberItems = useDirectusItems('mailing_list_contacts');

  // ── Contact CRUD ──────────────────────────────────────────────────
  const getContacts = async (params?: {
    status?: string;
    search?: string;
    tags?: string[];
    industry?: string;
    limit?: number;
    page?: number;
  }): Promise<{ data: Contact[]; total: number }> => {
    const filter: any = { _and: [] };

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

    const data = await items.list({
      fields: ['*'],
      filter: filter._and.length ? filter : undefined,
      sort: ['last_name', 'first_name'],
      limit: params?.limit || 50,
      page: params?.page || 1,
    });

    const total = await items.count(filter._and.length ? filter : undefined);

    return { data, total };
  };

  const getContact = async (id: number): Promise<Contact> => {
    return items.get(id, {
      fields: ['*', 'lists.id', 'lists.list_id.*', 'lists.subscribed'],
    });
  };

  const createContact = async (payload: CreateContactPayload): Promise<Contact> => {
    return items.create({
      ...payload,
      status: 'active',
      email_subscribed: true,
      unsubscribe_token: crypto.randomUUID(),
      source: payload.source || 'manual',
    } as any);
  };

  const updateContact = async (id: number, payload: Partial<Contact>): Promise<Contact> => {
    return items.update(id, payload);
  };

  const deleteContact = async (id: number): Promise<boolean> => {
    return items.remove(id);
  };

  const unsubscribeContact = async (id: number): Promise<void> => {
    await updateContact(id, {
      email_subscribed: false,
      email_unsubscribed_at: new Date().toISOString(),
      status: 'unsubscribed',
    } as any);
  };

  // ── Tag management ────────────────────────────────────────────────
  const addTag = async (id: number, tag: string, contact: Contact): Promise<void> => {
    const tags = [...(contact.tags || [])];
    if (!tags.includes(tag)) {
      await updateContact(id, { tags: [...tags, tag] } as any);
    }
  };

  const removeTag = async (id: number, tag: string, contact: Contact): Promise<void> => {
    await updateContact(id, {
      tags: (contact.tags || []).filter((t) => t !== tag),
    } as any);
  };

  // ── Mailing list membership ───────────────────────────────────────
  const addToList = async (contactId: number, listId: number, source = 'manual'): Promise<void> => {
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

  const removeFromList = async (contactId: number, listId: number): Promise<void> => {
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
    addTag,
    removeTag,
    addToList,
    removeFromList,
  };
}
