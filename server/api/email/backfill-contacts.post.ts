/**
 * One-time backfill: ensure every directus_user has a corresponding Contact
 * in the requesting organization.
 *
 * For each directus_user without a Contact where Contact.user = user.id,
 * creates (or adopts by email-match with a null user FK) a Contact copying
 * first_name, last_name, email, phone, photo. Always ensures a
 * contacts_organizations junction row to the target org.
 *
 * Contact.client is left null — pair manually via the /contacts UI.
 *
 * Body: { organizationId: string }
 * Gating: current user must be an active owner or admin of the target org.
 */

import { readItems, readUsers } from '@directus/sdk';
import { ensureContactForUser } from '~~/server/utils/contact-sync';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { organizationId } = body || {};

  if (!organizationId) {
    throw createError({
      statusCode: 400,
      message: 'organizationId is required',
    });
  }

  const session = await getUserSession(event);
  const currentUserId = (session as any)?.user?.id;
  if (!currentUserId) {
    throw createError({ statusCode: 401, message: 'Not authenticated' });
  }

  const directus = getServerDirectus();

  const requesterMembership = await directus.request(
    readItems('org_memberships', {
      filter: {
        organization: { _eq: organizationId },
        user: { _eq: currentUserId },
        status: { _eq: 'active' },
      },
      fields: ['id', 'role.slug'],
      limit: 1,
    }),
  ) as any[];

  const role = requesterMembership[0]?.role?.slug;
  if (!role || !['owner', 'admin'].includes(role)) {
    throw createError({
      statusCode: 403,
      message: 'Only owners and admins can run this backfill',
    });
  }

  const users = await directus.request(
    readUsers({
      fields: ['id', 'first_name', 'last_name', 'email', 'phone', 'cell_phone', 'avatar'],
      limit: -1,
    }),
  ) as any[];

  const created: string[] = [];
  const adopted: string[] = [];
  const existing: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const errors: Array<{ id: string; email?: string; error: string }> = [];

  for (const user of users) {
    if (!user.email) {
      skipped.push({ id: user.id, reason: 'no email' });
      continue;
    }
    try {
      const avatarId = typeof user.avatar === 'string'
        ? user.avatar
        : user.avatar?.id || null;

      const result = await ensureContactForUser({
        directus,
        organizationId,
        userId: user.id,
        email: user.email,
        firstName: user.first_name || null,
        lastName: user.last_name || null,
        phone: user.phone || user.cell_phone || null,
        photo: avatarId,
        source: 'backfill',
      });

      if (result.outcome === 'created') created.push(user.id);
      else if (result.outcome === 'adopted') adopted.push(user.id);
      else existing.push(user.id);
    } catch (err: any) {
      errors.push({
        id: user.id,
        email: user.email,
        error: err?.message || 'unknown error',
      });
    }
  }

  return {
    success: true,
    totalUsers: users.length,
    created: created.length,
    adopted: adopted.length,
    existing: existing.length,
    skipped: skipped.length,
    errors: errors.length,
    details: {
      created,
      adopted,
      existing,
      skipped,
      errors,
    },
  };
});
