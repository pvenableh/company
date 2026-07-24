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
        // Graduation context + the linked Earnest lead (the single pipeline —
        // CardDesk's own pipeline_stage is retired in favour of leads.stage).
        'is_partner', 'client_at', 'partner_at', 'earnest_lead_id',
        'conversion_reason', 'estimated_value',
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
  if (!card) return { cd_contact: null, lead: null, activities: [], plans: [], tasks: [] };

  // Resolve the linked Earnest lead so the card reflects the SINGLE pipeline
  // (leads.stage). Prefer the explicit FK; fall back to the lead attached to
  // this same contact (covers cards promoted before earnest_lead_id was set).
  let lead: any = null;
  try {
    const leadFields = ['id', 'name', 'stage', 'estimated_value'];
    let leadRows: any[] = [];
    if (card.earnest_lead_id) {
      leadRows = await directus.request(
        readItems('leads', { fields: leadFields, filter: { id: { _eq: card.earnest_lead_id } }, limit: 1 }),
      );
    }
    if (!leadRows.length) {
      leadRows = await directus.request(
        readItems('leads', {
          fields: leadFields,
          filter: { related_contact: { _eq: contactId } },
          sort: ['-date_created'],
          limit: 1,
        }),
      );
    }
    lead = leadRows[0] || null;
  } catch {
    lead = null;
  }

  // Activities + follow-up plans/tasks are all user-scoped on the same card.
  // Plans/tasks are read-only context (authored by the CardDesk app); we fetch
  // them with the server token so the panel works even before the per-user
  // read perms (scripts/setup-carddesk-permissions.ts) have been applied.
  const [activities, plans, tasks] = await Promise.all([
    directus.request(
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
    ).catch(() => []),
    directus.request(
      readItems('cd_plans', {
        fields: ['id', 'title', 'status', 'date_created'],
        filter: {
          _and: [
            { contact: { _eq: card.id } },
            { user_created: { _eq: userId } },
          ],
        },
        sort: ['-date_created'],
        limit: 50,
      }),
    ).catch(() => []),
    directus.request(
      readItems('cd_tasks', {
        fields: ['id', 'title', 'channel', 'note', 'due_at', 'status', 'completed_at', 'plan'],
        filter: {
          _and: [
            { contact: { _eq: card.id } },
            { user_created: { _eq: userId } },
          ],
        },
        sort: ['due_at', 'sort'],
        limit: 100,
      }),
    ).catch(() => []),
  ]);

  return { cd_contact: card, lead, activities, plans, tasks };
});
