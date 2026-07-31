/**
 * Shared org provisioning — seed a fresh organization for an owner user.
 *
 * Extracted so the password-at-end signup (`/api/signup/complete`) can create
 * an org with the exact same shape as the authenticated wizard
 * (`/api/org/create`) and registration (`/api/auth/register`): legacy junction,
 * the 5 system org_roles, the owner org_membership, the team-member contact, the
 * Directus folder + Clients/Financials/Uploads subfolders, and a best-effort
 * welcome email.
 *
 * The two existing endpoints still inline their own copy for now; this util is
 * the single source of truth going forward and they can adopt it later.
 */
import { createItem, createFolder, updateItem } from '@directus/sdk';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_METADATA } from '~~/shared/permissions';
import type { RoleSlug } from '~~/shared/permissions';
import { ensureContactForUser } from '~~/server/utils/contact-sync';
import { sendOrgWelcomeEmail } from '~~/server/utils/welcome-email';

const SYSTEM_ROLES: RoleSlug[] = ['owner', 'admin', 'manager', 'member', 'client'];

export interface OrgOwner {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
}

export interface SeededOrg {
  id: string;
  name: string;
  folderId: string | null;
  roleIds: Record<string, string>;
}

/**
 * Create the organization row from `orgData` and seed all the surrounding
 * records for `owner`. On failure after the org row exists, best-effort rolls
 * back the partial bootstrap (roles/memberships/junction/org) and rethrows so
 * the caller never leaves a half-provisioned org behind.
 *
 * `orgData` must already contain the full org payload (name, slug, plan, capped
 * limits, subscription_status, and any brand/industry fields). `plan` is passed
 * separately only for the welcome email copy.
 */
export async function seedOrganizationForOwner(
  directus: ReturnType<typeof getServerDirectus>,
  owner: OrgOwner,
  orgData: Record<string, any>,
  plan: string,
): Promise<SeededOrg> {
  const org = (await directus.request(createItem('organizations', orgData))) as any;
  const orgId: string = org.id;

  try {
    // Legacy junction (backward compat)
    await directus.request(
      createItem('organizations_directus_users', {
        organizations_id: orgId,
        directus_users_id: owner.id,
      }),
    );

    // System roles
    const roleIds: Record<string, string> = {};
    for (const slug of SYSTEM_ROLES) {
      const meta = ROLE_METADATA[slug];
      const role = (await directus.request(
        createItem('org_roles', {
          name: meta.label,
          slug,
          is_system: true,
          permissions: DEFAULT_ROLE_PERMISSIONS[slug],
          organization: orgId,
        }),
      )) as any;
      roleIds[slug] = role.id;
    }

    // Owner membership
    await directus.request(
      createItem('org_memberships', {
        organization: orgId,
        user: owner.id,
        role: roleIds['owner'],
        status: 'active',
        accepted_at: new Date().toISOString(),
      }),
    );

    // Team-member contact (non-fatal)
    try {
      await ensureContactForUser({
        directus,
        organizationId: orgId,
        userId: owner.id,
        email: owner.email,
        firstName: owner.firstName || null,
        lastName: owner.lastName || null,
        phone: owner.phone || null,
        source: 'signup_complete',
      });
    } catch (contactError: any) {
      console.error('[org-provision] contact creation failed (non-fatal):', contactError?.message);
    }

    // Directus folder + standard subfolders (non-fatal)
    let folderId: string | null = null;
    try {
      const folder = (await directus.request(
        createFolder({ name: org.name, parent: null }),
      )) as any;
      folderId = folder.id;
      await directus.request(updateItem('organizations', orgId, { folder: folderId }));
      for (const subName of ['Clients', 'Financials', 'Uploads']) {
        try {
          await directus.request(createFolder({ name: subName, parent: folderId }));
        } catch (subErr) {
          console.warn(`[org-provision] failed to create ${subName} subfolder:`, subErr);
        }
      }
    } catch (folderError) {
      console.warn('[org-provision] failed to create org folder:', folderError);
    }

    // Welcome email (non-fatal)
    try {
      await sendOrgWelcomeEmail({
        to: owner.email,
        firstName: owner.firstName || null,
        orgName: org.name,
        plan,
      });
    } catch (welcomeErr: any) {
      console.warn('[org-provision] welcome email failed (non-fatal):', welcomeErr?.message);
    }

    return { id: orgId, name: org.name, folderId, roleIds };
  } catch (seedError: any) {
    // Roll back the partial bootstrap so we never leave an owner with an org but
    // no membership (locked out of every requireOrgPermission-gated feature).
    console.error('[org-provision] seeding failed — rolling back org:', seedError?.message);
    try {
      const { readItems, deleteItems, deleteItem } = await import('@directus/sdk');
      for (const coll of ['org_memberships', 'org_roles'] as const) {
        const rows = (await directus
          .request(readItems(coll, { filter: { organization: { _eq: orgId } }, fields: ['id'], limit: -1 }))
          .catch(() => [])) as Array<{ id: string }>;
        if (rows.length) await directus.request(deleteItems(coll, rows.map((r) => r.id))).catch(() => {});
      }
      const junctions = (await directus
        .request(readItems('organizations_directus_users', { filter: { organizations_id: { _eq: orgId } }, fields: ['id'], limit: -1 }))
        .catch(() => [])) as Array<{ id: number | string }>;
      if (junctions.length) await directus.request(deleteItems('organizations_directus_users', junctions.map((r) => r.id))).catch(() => {});
      await directus.request(deleteItem('organizations', orgId)).catch(() => {});
    } catch (rollbackErr: any) {
      console.error('[org-provision] rollback incomplete:', rollbackErr?.message);
    }
    throw createError({ statusCode: 500, message: 'We could not finish setting up your workspace. Please try again.' });
  }
}
