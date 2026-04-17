/**
 * Backfill Contact records for pre-SaaS directus_users.
 *
 * Creates one Contact per directus_user that doesn't already have a
 * Contact pointing at them. Idempotent — safe to re-run.
 *
 * Body: {
 *   organizationId: string,   // required — owner/admin gate + org scope
 *   clientId?: string,         // optional — pre-assign Contact.client in bulk
 *   dryRun?: boolean,          // preview without writing
 * }
 *
 * Returns: { created, skipped, errors, dryRun }
 *
 * Gated: caller must be owner or admin of the target org.
 */
import { readItems, readUsers } from '@directus/sdk';
import { ensureContactForUser } from '~~/server/utils/contact-sync';

interface BackfillResult {
  created: number;
  skipped: number;
  errors: Array<{ userId: string; email: string; reason: string }>;
  dryRun: boolean;
  wouldProcess?: Array<{ userId: string; email: string }>;
}

export default defineEventHandler(async (event): Promise<BackfillResult> => {
  const session = await getUserSession(event);
  const currentUserId = session?.user?.id;

  if (!currentUserId) {
    throw createError({ statusCode: 401, message: 'Not authenticated' });
  }

  const body = await readBody(event);
  const { organizationId, clientId, dryRun } = body ?? {};

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  const directus = getServerDirectus();

  // Gate: owner/admin of this org only
  const memberships = await directus.request(
    readItems('org_memberships', {
      filter: {
        _and: [
          { user: { _eq: currentUserId } },
          { organization: { _eq: organizationId } },
          { status: { _eq: 'active' } },
        ],
      },
      fields: ['role.slug'],
      limit: 1,
    }),
  ) as any[];

  const callerRole = memberships?.[0]?.role?.slug;
  if (!callerRole || !['owner', 'admin'].includes(callerRole)) {
    throw createError({
      statusCode: 403,
      message: 'Only organization owners and admins can run the contact backfill',
    });
  }

  // If a clientId is provided, make sure it belongs to this org
  if (clientId) {
    const client = await directus.request(
      readItems('clients', {
        filter: {
          id: { _eq: clientId },
          organization: { _eq: organizationId },
        },
        fields: ['id'],
        limit: 1,
      }),
    ) as any[];
    if (!client.length) {
      throw createError({ statusCode: 400, message: 'Client not found in this organization' });
    }
  }

  // Users tied to this org via org_memberships
  const orgMemberships = await directus.request(
    readItems('org_memberships', {
      filter: { organization: { _eq: organizationId } },
      fields: ['user'],
      limit: -1,
    }),
  ) as any[];

  const userIds = Array.from(
    new Set(
      orgMemberships
        .map((m) => (typeof m.user === 'string' ? m.user : m.user?.id))
        .filter(Boolean),
    ),
  ) as string[];

  if (!userIds.length) {
    return { created: 0, skipped: 0, errors: [], dryRun: !!dryRun };
  }

  const users = await directus.request(
    readUsers({
      filter: { id: { _in: userIds } },
      fields: ['id', 'email', 'first_name', 'last_name'],
      limit: -1,
    }),
  ) as any[];

  const result: BackfillResult = {
    created: 0,
    skipped: 0,
    errors: [],
    dryRun: !!dryRun,
  };

  if (dryRun) {
    result.wouldProcess = users.map((u) => ({ userId: u.id, email: u.email || '' }));
    return result;
  }

  for (const u of users) {
    try {
      const res = await ensureContactForUser({
        directus,
        organizationId,
        userId: u.id,
        email: u.email || '',
        firstName: u.first_name,
        lastName: u.last_name,
        clientId: clientId || null,
        source: 'backfill:directus_users',
      });
      if (res.created) result.created++;
      else result.skipped++;
    } catch (err: any) {
      result.errors.push({
        userId: u.id,
        email: u.email || '',
        reason: err?.message || 'unknown',
      });
    }
  }

  return result;
});
