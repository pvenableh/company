/**
 * One-click unsubscribe handler.
 * Linked from {{unsubscribe_url}} in email footers.
 */
import { readItems, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const { token } = await readBody(event);

  if (!token) {
    return { success: false, error: 'Missing token' };
  }

  const directus = getServerDirectus();

  // Find contact by unsubscribe token
  const contacts = await directus.request(
    readItems('contacts', {
      filter: { unsubscribe_token: { _eq: token } },
      fields: ['id', 'email', 'first_name'],
      limit: 1,
    })
  ) as any[];

  if (!contacts?.length) {
    return { success: false, error: 'Invalid token' };
  }

  const contact = contacts[0];

  // Unsubscribe the contact globally
  await directus.request(
    updateItem('contacts', contact.id, {
      email_subscribed: false,
      email_unsubscribed_at: new Date().toISOString(),
    })
  );

  // Also mark all list memberships as unsubscribed
  const memberships = await directus.request(
    readItems('mailing_list_contacts', {
      filter: {
        _and: [
          { contact_id: { _eq: contact.id } },
          { subscribed: { _eq: true } },
        ],
      },
      fields: ['id'],
      limit: -1,
    })
  ) as any[];

  if (memberships?.length > 0) {
    await Promise.all(
      memberships.map((m: any) =>
        directus.request(
          updateItem('mailing_list_contacts', m.id, {
            subscribed: false,
            date_unsubscribed: new Date().toISOString(),
          })
        )
      )
    );
  }

  return { success: true, email: contact.email };
});
