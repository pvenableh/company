/**
 * Create Organization endpoint (for authenticated users)
 *
 * Creates a new organization, seeds system org_roles,
 * and creates an owner org_membership for the current user.
 */

import { createItem } from '@directus/sdk';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_METADATA } from '~~/shared/permissions';
import type { RoleSlug } from '~~/shared/permissions';

const SYSTEM_ROLES: RoleSlug[] = ['owner', 'admin', 'manager', 'member', 'client'];

export default defineEventHandler(async (event) => {
  // Require authenticated session
  const session = await requireUserSession(event);
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const { name, plan, industry, location, website, brand_color } = body;

  if (!name?.trim()) {
    throw createError({ statusCode: 400, message: 'Organization name is required' });
  }

  const validPlans = ['solo', 'pro', 'enterprise'];
  const orgPlan = validPlans.includes(plan) ? plan : 'solo';

  const directus = getServerDirectus();

  try {
    // 1. Create the organization
    const orgData: Record<string, any> = {
      name: name.trim(),
      status: 'published',
      active: true,
      plan: orgPlan,
    };
    if (industry) orgData.industry = industry;
    if (location) orgData.location = location.trim();
    if (website) orgData.website = website.trim();
    if (brand_color) orgData.brand_color = brand_color.trim();

    const org = await directus.request(
      createItem('organizations', orgData)
    ) as any;

    // 2. Link user to org via legacy junction
    await directus.request(
      createItem('organizations_directus_users', {
        organizations_id: org.id,
        directus_users_id: session.user.id,
      })
    );

    // 3. Seed system roles
    const createdRoles: Record<string, string> = {};
    for (const slug of SYSTEM_ROLES) {
      const meta = ROLE_METADATA[slug];
      const role = await directus.request(
        createItem('org_roles', {
          name: meta.label,
          slug,
          is_system: true,
          permissions: DEFAULT_ROLE_PERMISSIONS[slug],
          organization: org.id,
        })
      ) as any;
      createdRoles[slug] = role.id;
    }

    // 4. Create owner membership
    await directus.request(
      createItem('org_memberships', {
        organization: org.id,
        user: session.user.id,
        role: createdRoles['owner'],
        status: 'active',
        accepted_at: new Date().toISOString(),
      })
    );

    // 5. Create a Directus folder for this organization
    let folderId: string | null = null;
    try {
      const folder = await directus.request(
        createItem('directus_folders', {
          name: name.trim(),
          parent: null,
        })
      ) as any;
      folderId = folder.id;

      // Link folder to org
      const { updateItem } = await import('@directus/sdk');
      await directus.request(
        updateItem('organizations', org.id, { folder: folderId })
      );

      // Create standard subfolders
      const subfolderNames = ['Clients', 'Financials', 'Uploads'];
      for (const subName of subfolderNames) {
        try {
          await directus.request(
            createItem('directus_folders', {
              name: subName,
              parent: folderId,
            })
          );
        } catch (subErr) {
          console.warn(`Failed to create ${subName} subfolder:`, subErr);
        }
      }
    } catch (folderError) {
      console.warn('Failed to create org folder:', folderError);
    }

    return {
      success: true,
      organization: { id: org.id, name: org.name },
      folder: folderId,
    };
  } catch (error: any) {
    console.error('Create org error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to create organization',
    });
  }
});
