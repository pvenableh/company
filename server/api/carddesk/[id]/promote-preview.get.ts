/**
 * Promote-preview — returns what the Promote modal should show.
 *
 * Looks up the cd_contact + checks for any existing `contacts` row matching
 * by email under the caller's selected org. Returns the cd_contact summary
 * and the match (if any) so the modal can render "Link to Jane Doe" vs
 * "Create new contact".
 *
 * Does NOT mutate anything. The promote.post.ts route does the actual write
 * once the user confirms.
 */
import { readItem, readItems } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export default defineEventHandler(async (event) => {
  const cdContactId = getRouterParam(event, 'id');
  if (!cdContactId) {
    throw createError({ statusCode: 400, message: 'cd_contact id required' });
  }
  const query = getQuery(event);
  const orgId = String(query.org_id || '');
  if (!orgId) {
    throw createError({ statusCode: 400, message: 'org_id query param required' });
  }

  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  await requireOrgMembership(event, orgId);

  const directus = getTypedDirectus();

  const cd: any = await directus.request(
    readItem('cd_contacts', cdContactId, {
      fields: ['id', 'name', 'first_name', 'last_name', 'email', 'phone', 'company', 'title', 'rating', 'is_client', 'user_created', 'promoted_contact'],
    }),
  );
  if (!cd) throw createError({ statusCode: 404, message: 'cd_contact not found' });
  if (cd.user_created !== userId) {
    throw createError({ statusCode: 403, message: 'Not your cd_contact' });
  }

  // Already promoted? Return the link so the UI can render the "already in
  // Earnest" state without showing the create/link choice.
  if (cd.promoted_contact) {
    const existing: any = await directus.request(
      readItem('contacts', cd.promoted_contact, {
        fields: ['id', 'first_name', 'last_name', 'email', 'company'],
      }),
    );
    return {
      cd_contact: pickCd(cd),
      already_promoted: true,
      promoted_contact: existing,
      match: null,
    };
  }

  // Email match under this org. Normalized lowercase + trim. If multiple
  // matches exist (rare — same email twice in the org), pick the
  // most-recently-updated.
  const normalized = (cd.email || '').trim().toLowerCase();
  let match: any = null;
  if (normalized) {
    const rows: any[] = await directus.request(
      readItems('contacts', {
        fields: ['id', 'first_name', 'last_name', 'email', 'company', 'date_updated'],
        filter: {
          _and: [
            { email: { _eq: normalized } },
            { organizations: { organizations_id: { _eq: orgId } } },
          ],
        },
        sort: ['-date_updated'],
        limit: 1,
      }),
    );
    match = rows[0] || null;
  }

  return {
    cd_contact: pickCd(cd),
    already_promoted: false,
    promoted_contact: null,
    match,
  };
});

function pickCd(cd: any) {
  const display = cd.name || `${cd.first_name || ''} ${cd.last_name || ''}`.trim() || 'Unknown';
  return {
    id: cd.id,
    display_name: display,
    first_name: cd.first_name,
    last_name: cd.last_name,
    email: cd.email,
    phone: cd.phone,
    company: cd.company,
    title: cd.title,
    rating: cd.rating,
  };
}
