/**
 * Helpers for keeping Contact records in sync with directus_users.
 *
 * Used by:
 *  - Invite flows (invite-member, invite-client) — ensures every invited user
 *    also has a Contact in the inviting org.
 *  - Backfill endpoint — one-time cleanup for pre-SaaS users.
 */
import { createItem, readItems, updateItem } from '@directus/sdk';

type Directus = ReturnType<typeof getServerDirectus>;

export interface EnsureContactInput {
  directus: Directus;
  organizationId: string;
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  photo?: string | null;
  clientId?: string | null;
  source?: string;
}

export interface EnsureContactResult {
  contactId: string;
  created: boolean;
  outcome: 'existing' | 'adopted' | 'created';
}

/**
 * Ensure there is a Contact for this user in this org.
 *
 * Resolution order (first match wins):
 *  1. Contact where user = userId
 *  2. Contact where email = email AND user is null (adopt by setting user FK)
 *  3. Create a new Contact
 *
 * Always ensures a contacts_organizations junction row for the target org.
 */
export async function ensureContactForUser(
  input: EnsureContactInput,
): Promise<EnsureContactResult> {
  const { directus, organizationId, userId, email, firstName, lastName, phone, photo, clientId, source } = input;

  // 1. Find by user FK
  let contactId: string | null = null;
  let outcome: 'existing' | 'adopted' | 'created' = 'existing';

  const byUser = await directus.request(
    readItems('contacts', {
      filter: { user: { _eq: userId } },
      fields: ['id'],
      limit: 1,
    }),
  ) as any[];

  if (byUser.length) {
    contactId = byUser[0].id;
  } else if (email) {
    // 2. Find by email with no user FK (adopt it)
    const byEmail = await directus.request(
      readItems('contacts', {
        filter: {
          _and: [
            { email: { _eq: email } },
            { user: { _null: true } },
          ],
        },
        fields: ['id'],
        limit: 1,
      }),
    ) as any[];

    if (byEmail.length) {
      const adoptId = byEmail[0].id as string;
      contactId = adoptId;
      outcome = 'adopted';
      await directus.request(
        updateItem('contacts', adoptId, { user: userId } as any),
      );
    }
  }

  // 3. Create
  if (!contactId) {
    const newContact = await directus.request(
      createItem('contacts', {
        user: userId,
        first_name: firstName || null,
        last_name: lastName || null,
        email: email || null,
        phone: phone || null,
        photo: photo || null,
        status: 'published',
        email_subscribed: true,
        source: source || 'invite',
        client: clientId || null,
      } as any),
    ) as any;
    contactId = newContact.id;
    outcome = 'created';
  } else if (clientId) {
    // If a clientId is provided and contact has none, attach it
    const existing = await directus.request(
      readItems('contacts', {
        filter: { id: { _eq: contactId } },
        fields: ['client'],
        limit: 1,
      }),
    ) as any[];
    const current = existing[0]?.client;
    const currentId = typeof current === 'string' ? current : current?.id;
    if (!currentId) {
      await directus.request(
        updateItem('contacts', contactId, { client: clientId } as any),
      );
    }
  }

  // Ensure M2M junction to this org
  const existingJunction = await directus.request(
    readItems('contacts_organizations', {
      filter: {
        _and: [
          { contacts_id: { _eq: contactId } },
          { organizations_id: { _eq: organizationId } },
        ],
      },
      fields: ['id'],
      limit: 1,
    }),
  ) as any[];

  if (!existingJunction.length) {
    await directus.request(
      createItem('contacts_organizations', {
        contacts_id: contactId,
        organizations_id: organizationId,
      }),
    );
  }

  return { contactId: contactId!, created: outcome === 'created', outcome };
}
