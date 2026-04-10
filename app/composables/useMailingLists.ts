import type { MailingList, Contact } from '~~/shared/email/contacts';

export function useMailingLists() {
  const items = useDirectusItems<MailingList>('mailing_lists');
  const memberItems = useDirectusItems('mailing_list_contacts');
  const { selectedOrg, getOrganizationFilter } = useOrganization();

  const getLists = async (): Promise<MailingList[]> => {
    const filter: any = { _and: [] };

    // Org-scope
    const orgFilter = getOrganizationFilter();
    if (orgFilter?.organization) {
      filter._and.push({ organization: orgFilter.organization });
    }

    filter._and.push({ status: { _eq: 'published' } });

    return items.list({
      fields: ['*'],
      filter: filter._and.length ? filter : undefined,
      sort: ['-is_default', 'name'],
    });
  };

  const getList = async (id: number): Promise<MailingList> => {
    return items.get(id, { fields: ['*'] });
  };

  const createList = async (payload: Partial<MailingList>): Promise<MailingList> => {
    // Auto-set organization on create
    return items.create({
      ...payload,
      status: 'published',
      organization: selectedOrg.value || undefined,
    } as any);
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
          { 'contact_id.status': { _eq: 'published' } },
        ],
      },
      limit: -1,
    });

    return (members || []).map((m: any) => {
      // Parse JSON string custom_fields before merging
      const contactCF = typeof m.contact_id.custom_fields === 'string'
        ? (() => { try { return JSON.parse(m.contact_id.custom_fields); } catch { return {}; } })()
        : (m.contact_id.custom_fields || {});
      const memberCF = typeof m.custom_fields === 'string'
        ? (() => { try { return JSON.parse(m.custom_fields); } catch { return {}; } })()
        : (m.custom_fields || {});
      return {
        ...m.contact_id,
        custom_fields: { ...contactCF, ...memberCF },
      };
    });
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
