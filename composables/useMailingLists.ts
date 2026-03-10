import type { MailingList, Contact } from '~/types/email/contacts';

export function useMailingLists() {
  const items = useDirectusItems<MailingList>('mailing_lists');
  const memberItems = useDirectusItems('mailing_list_contacts');

  const getLists = async (): Promise<MailingList[]> => {
    return items.list({
      fields: ['*'],
      filter: { status: { _eq: 'active' } },
      sort: ['-is_default', 'name'],
    });
  };

  const getList = async (id: number): Promise<MailingList> => {
    return items.get(id, { fields: ['*'] });
  };

  const createList = async (payload: Partial<MailingList>): Promise<MailingList> => {
    return items.create({ ...payload, status: 'active' } as any);
  };

  const updateList = async (id: number, payload: Partial<MailingList>): Promise<MailingList> => {
    return items.update(id, payload);
  };

  const getListContacts = async (listId: number): Promise<Contact[]> => {
    const members = await memberItems.list({
      fields: ['contact_id.*', 'custom_fields'],
      filter: {
        _and: [
          { list_id: { _eq: listId } },
          { subscribed: { _eq: true } },
          { 'contact_id.email_subscribed': { _eq: true } },
          { 'contact_id.email_bounced': { _eq: false } },
          { 'contact_id.status': { _eq: 'active' } },
        ],
      },
      limit: -1,
    });

    return (members || []).map((m: any) => ({
      ...m.contact_id,
      custom_fields: {
        ...(m.contact_id.custom_fields || {}),
        ...(m.custom_fields || {}),
      },
    }));
  };

  // Resolve contacts from multiple lists, deduplicated by email
  const resolveRecipients = async (listIds: number[]): Promise<Contact[]> => {
    const allContacts = await Promise.all(listIds.map((id) => getListContacts(id)));
    const seen = new Set<string>();
    const unique: Contact[] = [];

    for (const contactList of allContacts) {
      for (const contact of contactList) {
        if (!seen.has(contact.email)) {
          seen.add(contact.email);
          unique.push(contact);
        }
      }
    }

    return unique;
  };

  const updateSubscriberCount = async (listId: number): Promise<void> => {
    const count = await memberItems.count({
      _and: [
        { list_id: { _eq: listId } },
        { subscribed: { _eq: true } },
        { 'contact_id.email_subscribed': { _eq: true } },
      ],
    });

    await items.update(listId, { subscriber_count: count } as any);
  };

  return {
    getLists,
    getList,
    createList,
    updateList,
    getListContacts,
    resolveRecipients,
    updateSubscriberCount,
  };
}
