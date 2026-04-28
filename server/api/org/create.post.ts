/**
 * Create Organization endpoint (for authenticated users)
 *
 * Creates a new organization, seeds system org_roles,
 * and creates an owner org_membership for the current user.
 */

import { createItem } from '@directus/sdk';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_METADATA } from '~~/shared/permissions';
import type { RoleSlug } from '~~/shared/permissions';
import { ensureContactForUser } from '~~/server/utils/contact-sync';
import { sendOrgWelcomeEmail } from '~~/server/utils/welcome-email';

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

  const validPlans = ['free', 'solo', 'studio', 'agency', 'enterprise'];
  const orgPlan = validPlans.includes(plan) ? plan : 'solo';

  const directus = getServerDirectus();

  try {
    // 1. Create the organization
    // `slug` is required by the schema. Derive from name and append a short
    // random suffix so two orgs with the same name don't collide on the
    // unique index (`Acme` + `Acme` would both become `acme`).
    const slugBase = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org';
    const slugSuffix = Math.random().toString(36).slice(2, 8);
    const orgData: Record<string, any> = {
      name: name.trim(),
      slug: `${slugBase}-${slugSuffix}`,
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

    // 4b. Create the team-member contact + org junction so the user appears
    // in mention pickers, scheduler invitee lists, etc. Uses the shared
    // helper which adopts an existing email-only contact if one exists.
    try {
      const sessionUser = session.user as any;
      await ensureContactForUser({
        directus,
        organizationId: org.id,
        userId: session.user.id,
        email: sessionUser.email,
        firstName: sessionUser.first_name || null,
        lastName: sessionUser.last_name || null,
        source: 'org_setup',
      });
    } catch (contactError: any) {
      console.error('[org/create] Team-member contact creation failed (non-fatal):', contactError?.message);
    }

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

    // Welcome email — best-effort, non-fatal. Captures the just-completed
    // signup; webhook-driven plan upgrades after Stripe checkout fire their
    // own follow-ups (see paymentchange handler) and don't re-trigger this.
    try {
      const sessionUser = session.user as any;
      await sendOrgWelcomeEmail({
        to: sessionUser.email,
        firstName: sessionUser.first_name || null,
        orgName: org.name,
        plan: orgPlan,
      });
    } catch (welcomeErr: any) {
      console.warn('[org/create] Welcome email failed (non-fatal):', welcomeErr?.message);
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
