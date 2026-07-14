// server/api/org/migrate-client-memberships.post.ts
/**
 * One-shot migration: copy `org_memberships WHERE role.slug='client'` rows
 * into the new `client_portal_users` collection.
 *
 * Body: { apply?: boolean }   — defaults to false (dry-run)
 *       { organizationId?: string }  — limit to one org
 *
 * Idempotent: if a `client_portal_users` row already exists for
 * `(organization, user)`, it is skipped (logged in the report).
 *
 * Source rows in `org_memberships` are NOT deleted in this step. After the
 * code cutover lands and soaks, a separate cleanup pass drops them.
 *
 * Admin-token via getServerDirectus(); requireOrgAdmin gate prevents random
 * users hitting it.
 */

import { readItems, readUsers, createItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const apply = body?.apply === true;
  const organizationId: string | undefined = body?.organizationId;

  const directus = getServerDirectus();

  // Gate: only Directus admins can run this. Cheaper than per-org membership
  // walks since it's a one-shot maintenance op.
  const config = useRuntimeConfig();
  const adminRoleId = config.public.adminRole || config.public.adminRoleId;
  const me = await directus.request(
    readUsers({
      filter: { id: { _eq: session.user.id } },
      fields: ['id', 'role'],
      limit: 1,
    } as any),
  ) as any[];
  const myRole = typeof me[0]?.role === 'object' ? me[0].role?.id : me[0]?.role;
  if (myRole !== adminRoleId) {
    throw createError({ statusCode: 403, message: 'Admin only' });
  }

  // 1. Pull all client-role memberships
  const clientFilter: any = {
    role: { slug: { _eq: 'client' } },
  };
  if (organizationId) {
    clientFilter.organization = { _eq: organizationId };
  }

  const memberships = await directus.request(
    readItems('org_memberships', {
      filter: clientFilter,
      fields: [
        'id', 'status', 'invited_at', 'accepted_at',
        'organization',
        'user',
        'client',
        'invited_by',
      ],
      limit: -1,
    }),
  ) as any[];

  // 2. Pull existing client_portal_users to dedupe
  const existing = await directus.request(
    readItems('client_portal_users', {
      fields: ['id', 'organization', 'user'],
      limit: -1,
    } as any),
  ) as any[];

  const existingKey = (orgId: string, userId: string) => `${orgId}:${userId}`;
  const existingSet = new Set<string>(
    existing
      .map((r) => {
        const orgId = typeof r.organization === 'object' ? r.organization?.id : r.organization;
        const userId = typeof r.user === 'object' ? r.user?.id : r.user;
        return orgId && userId ? existingKey(orgId, userId) : null;
      })
      .filter((x): x is string => !!x),
  );

  const toMigrate: any[] = [];
  const skipped: any[] = [];
  const malformed: any[] = [];

  for (const m of memberships) {
    const orgId = typeof m.organization === 'object' ? m.organization?.id : m.organization;
    const userId = typeof m.user === 'object' ? m.user?.id : m.user;
    const clientId = typeof m.client === 'object' ? m.client?.id : m.client;
    const invitedBy = typeof m.invited_by === 'object' ? m.invited_by?.id : m.invited_by;

    if (!orgId || !userId) {
      malformed.push({ id: m.id, reason: 'missing org or user' });
      continue;
    }
    if (!clientId) {
      malformed.push({ id: m.id, reason: 'missing client scope' });
      continue;
    }

    if (existingSet.has(existingKey(orgId, userId))) {
      skipped.push({ id: m.id, reason: 'already migrated' });
      continue;
    }

    toMigrate.push({
      sourceId: m.id,
      payload: {
        organization: orgId,
        user: userId,
        client: clientId,
        status: m.status || 'pending',
        invited_at: m.invited_at || null,
        accepted_at: m.accepted_at || null,
        invited_by: invitedBy || null,
      },
    });
  }

  if (!apply) {
    return {
      mode: 'dry-run',
      sourceCount: memberships.length,
      wouldMigrate: toMigrate.length,
      alreadyMigrated: skipped.length,
      malformed,
      sample: toMigrate.slice(0, 3).map((r) => r.payload),
    };
  }

  const created: string[] = [];
  const failed: any[] = [];

  for (const row of toMigrate) {
    try {
      const result = await directus.request(
        createItem('client_portal_users', row.payload as any),
      ) as any;
      created.push(result.id);
    } catch (err: any) {
      failed.push({ sourceId: row.sourceId, error: err?.message || String(err) });
    }
  }

  return {
    mode: 'apply',
    sourceCount: memberships.length,
    created: created.length,
    alreadyMigrated: skipped.length,
    malformed: malformed.length,
    failed: failed.length,
    failures: failed,
  };
});
