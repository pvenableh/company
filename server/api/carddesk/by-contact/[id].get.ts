/**
 * Reverse-lookup: given an Earnest contacts.id, return the current user's
 * cd_contact that points at it (if any) plus the 5 most recent
 * cd_activities for that card.
 *
 * Used by /contacts/[id]'s "Sourced via Card Desk" chip → slide-over to
 * surface the deck context (rating, met-at, last activity) without
 * making the user open the Card Desk dashboard separately.
 *
 * cd_contacts is user-scoped, so this only returns data when the calling
 * user is the one who originally scanned/created the card — partners
 * inside the same org cannot peek at each other's rolodex.
 *
 * Returns null cd_contact (200) when no match exists.
 */
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const contactId = getRouterParam(event, 'id');
  if (!contactId) throw createError({ statusCode: 400, message: 'contact id required' });

  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const directus = getTypedDirectus();

  const cards: any[] = await directus.request(
    readItems('cd_contacts', {
      fields: [
        'id', 'name', 'first_name', 'last_name', 'email', 'phone',
        'company', 'title', 'rating', 'industry', 'met_at', 'notes',
        'is_client', 'hibernated', 'date_created',
      ],
      filter: {
        _and: [
          { promoted_contact: { _eq: contactId } },
          { user_created: { _eq: userId } },
        ],
      },
      limit: 1,
    }),
  );

  const card = cards[0] || null;
  if (!card) return { cd_contact: null, activities: [] };

  const activities: any[] = await directus.request(
    readItems('cd_activities', {
      fields: ['id', 'type', 'label', 'note', 'date', 'is_response'],
      filter: {
        _and: [
          { contact: { _eq: card.id } },
          { user_created: { _eq: userId } },
        ],
      },
      sort: ['-date'],
      limit: 5,
    }),
  );

  return { cd_contact: card, activities };
});
