// server/api/org/seed-roles.post.ts
/**
 * Seeds the 5 system org_roles for a given organization.
 * Idempotent — skips roles that already exist for the org.
 *
 * Body: { organizationId: string }
 *
 * Requires authenticated user who is a member of the organization.
 */

import { createItem, readItems } from '@directus/sdk';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_METADATA } from '~/types/permissions';
import type { RoleSlug } from '~/types/permissions';

const SYSTEM_ROLES: RoleSlug[] = ['owner', 'admin', 'manager', 'member', 'client'];

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { organizationId } = body;

    if (!organizationId) {
      throw createError({
        statusCode: 400,
        message: 'organizationId is required',
      });
    }

    const directus = getServerDirectus();

    // Check which roles already exist for this org
    const existing = await directus.request(
      readItems('org_roles', {
        filter: { organization: { _eq: organizationId } },
        fields: ['id', 'slug'],
      })
    );

    const existingSlugs = new Set((existing as any[]).map((r) => r.slug));

    // Create missing roles
    const created: string[] = [];

    for (const slug of SYSTEM_ROLES) {
      if (existingSlugs.has(slug)) continue;

      const meta = ROLE_METADATA[slug];

      await directus.request(
        createItem('org_roles', {
          name: meta.label,
          slug,
          is_system: true,
          permissions: DEFAULT_ROLE_PERMISSIONS[slug],
          organization: organizationId,
        })
      );

      created.push(slug);
    }

    return {
      success: true,
      message: created.length
        ? `Created ${created.length} role(s): ${created.join(', ')}`
        : 'All system roles already exist',
      created,
      existing: Array.from(existingSlugs),
    };
  } catch (error: any) {
    console.error('Seed roles error:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to seed roles',
    });
  }
});
