import type { ContactList } from '~/types/email/blocks';

export function useContactLists() {
  const items = useDirectusItems<ContactList>('contact_lists');
  const memberItems = useDirectusItems('contact_list_members');

  const getLists = async (): Promise<ContactList[]> => {
    return items.list({
      fields: ['*'],
      filter: { status: { _eq: 'published' } },
      sort: ['name'],
    });
  };

  const getList = async (id: number): Promise<ContactList> => {
    return items.get(id, { fields: ['*', 'members.*', 'members.contact_id.*'] });
  };

  const createList = async (data: Partial<ContactList>): Promise<ContactList> => {
    return items.create(data);
  };

  const updateList = async (id: number, data: Partial<ContactList>): Promise<ContactList> => {
    return items.update(id, data);
  };

  const getListContacts = async (listId: number): Promise<any[]> => {
    return memberItems.list({
      fields: ['contact_id.*'],
      filter: {
        _and: [
          { list_id: { _eq: listId } },
          { subscribed: { _eq: true } },
          { 'contact_id.email_subscribed': { _eq: true } },
        ],
      },
      limit: -1,
    });
  };

  const addContactToList = async (listId: number, contactId: number) => {
    return memberItems.create({
      list_id: listId,
      contact_id: contactId,
      subscribed: true,
      date_subscribed: new Date().toISOString(),
    });
  };

  const removeContactFromList = async (memberId: number) => {
    return memberItems.update(memberId, {
      subscribed: false,
      date_unsubscribed: new Date().toISOString(),
    });
  };

  return {
    getLists,
    getList,
    createList,
    updateList,
    getListContacts,
    addContactToList,
    removeContactFromList,
  };
}
