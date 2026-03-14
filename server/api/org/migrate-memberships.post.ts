// server/api/org/migrate-memberships.post.ts
/**
 * One-time migration: converts existing `organizations_directus_users`
 * junction entries into `org_memberships` records.
 *
 * Mapping logic:
 * - Users with Directus admin role     → org admin role
 * - Users with client_manager role     → org manager role
 * - All other users                    → org member role
 *
 * Idempotent — skips (org, user) pairs that already have a membership.
 *
 * Body: { organizationId?: string }
 * If organizationId is provided, migrates only that org.
 * If omitted, migrates ALL organizations.
 */

import { readItems, createItem } from '@directus/sdk';

const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';
const CLIENT_MANAGER_ROLE_ID = '7b62b285-e3a8-46ff-9e8c-d1445a3c13bb';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { organizationId } = body || {};

    const directus = getServerDirectus();

    // 1. Get junction entries
    const junctionFilter: any = {};
    if (organizationId) {
      junctionFilter.organizations_id = { _eq: organizationId };
    }

    const junctions = await directus.request(
      readItems('organizations_directus_users', {
        filter: Object.keys(junctionFilter).length ? junctionFilter : undefined,
        fields: [
          'id',
          'organizations_id',
          'directus_users_id.id',
          'directus_users_id.role',
        ],
        limit: -1,
      })
    ) as any[];

    if (!junctions.length) {
      return { success: true, message: 'No junction entries found', migrated: 0 };
    }

    // 2. Collect unique org IDs and fetch their org_roles
    const orgIds = [...new Set(junctions.map((j) => j.organizations_id))];

    const orgRolesMap = new Map<string, Map<string, string>>();

    for (const orgId of orgIds) {
      const roles = await directus.request(
        readItems('org_roles', {
          filter: { organization: { _eq: orgId } },
          fields: ['id', 'slug'],
        })
      ) as any[];

      const slugToId = new Map<string, string>();
      for (const r of roles) {
        slugToId.set(r.slug, r.id);
      }
      orgRolesMap.set(orgId, slugToId);
    }

    // 3. Get existing memberships to avoid duplicates
    const existingMemberships = await directus.request(
      readItems('org_memberships', {
        filter: organizationId
          ? { organization: { _eq: organizationId } }
          : undefined,
        fields: ['organization', 'user'],
        limit: -1,
      })
    ) as any[];

    const existingKeys = new Set(
      existingMemberships.map((m: any) => `${m.organization}:${m.user}`)
    );

    // 4. Create memberships
    let migrated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const junction of junctions) {
      const orgId = junction.organizations_id;
      const userId = junction.directus_users_id?.id || junction.directus_users_id;
      const userRoleId = junction.directus_users_id?.role;

      if (!orgId || !userId) {
        skipped++;
        continue;
      }

      // Skip if membership already exists
      const key = `${orgId}:${userId}`;
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }

      // Map Directus role to org role slug
      const slugMap = orgRolesMap.get(orgId);
      if (!slugMap) {
        errors.push(`No org_roles found for org ${orgId}. Run seed-roles first.`);
        continue;
      }

      let targetSlug = 'member';
      if (userRoleId === ADMIN_ROLE_ID) {
        targetSlug = 'admin';
      } else if (userRoleId === CLIENT_MANAGER_ROLE_ID) {
        targetSlug = 'manager';
      }

      const orgRoleId = slugMap.get(targetSlug);
      if (!orgRoleId) {
        errors.push(`Missing '${targetSlug}' role for org ${orgId}`);
        continue;
      }

      try {
        await directus.request(
          createItem('org_memberships', {
            organization: orgId,
            user: userId,
            role: orgRoleId,
            status: 'active',
            accepted_at: new Date().toISOString(),
          })
        );
        migrated++;
        existingKeys.add(key);
      } catch (err: any) {
        errors.push(`Failed to create membership for ${userId} in ${orgId}: ${err.message}`);
      }
    }

    return {
      success: true,
      message: `Migration complete: ${migrated} created, ${skipped} skipped`,
      migrated,
      skipped,
      errors: errors.length ? errors : undefined,
    };
  } catch (error: any) {
    console.error('Migrate memberships error:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Migration failed',
    });
  }
});
