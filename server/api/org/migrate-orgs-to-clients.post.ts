// server/api/org/migrate-orgs-to-clients.post.ts
/**
 * Migration script: Copy organizations with category='Client' into the clients collection.
 *
 * This creates client records under a target organization, mapping overlapping fields.
 * It does NOT delete the original organization records — you can do that manually after verifying.
 *
 * Body:
 *   targetOrganizationId: string  — The org that will own the new client records
 *   dryRun?: boolean              — If true, returns what would be created without writing (default: true)
 *
 * Returns: { migrated: [...], skipped: [...], errors: [...] }
 */

import { readItems, createItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const { targetOrganizationId, dryRun = true } = body;

  if (!targetOrganizationId) {
    throw createError({
      statusCode: 400,
      message: 'targetOrganizationId is required',
    });
  }

  const directus = getTypedDirectus();

  try {
    // 1. Verify the requesting user is owner/admin of the target org
    const membership = await directus.request(
      readItems('org_memberships', {
        filter: {
          organization: { _eq: targetOrganizationId },
          user: { _eq: userId },
          status: { _eq: 'active' },
        },
        fields: ['id', 'role.slug'],
        limit: 1,
      }),
    ) as any[];

    const role = membership[0]?.role?.slug;
    if (!role || !['owner', 'admin'].includes(role)) {
      throw createError({
        statusCode: 403,
        message: 'Only owners and admins can run this migration',
      });
    }

    // 2. Fetch all organizations with category='Client'
    const clientOrgs = await directus.request(
      readItems('organizations', {
        filter: {
          category: { _eq: 'Client' },
        },
        fields: [
          'id',
          'name',
          'website',
          'logo',
          'industry',
          'phone',
          'email',
          'notes',
          'tags',
          'address',
          'description',
          'status',
          'stripe_customer_id',
          'date_created',
        ],
        limit: 500,
      }),
    ) as any[];

    if (clientOrgs.length === 0) {
      return {
        message: 'No organizations with category=Client found',
        migrated: [],
        skipped: [],
        errors: [],
      };
    }

    // 3. Check which ones already exist as clients (by name match)
    const existingClients = await directus.request(
      readItems('clients', {
        filter: {
          organization: { _eq: targetOrganizationId },
        },
        fields: ['id', 'name'],
        limit: 500,
      }),
    ) as any[];

    const existingNames = new Set(
      existingClients.map((c: any) => c.name?.toLowerCase().trim()),
    );

    // 4. Process each org
    const migrated: any[] = [];
    const skipped: any[] = [];
    const errors: any[] = [];

    for (const org of clientOrgs) {
      const orgName = org.name?.trim();

      if (!orgName) {
        skipped.push({ id: org.id, reason: 'No name' });
        continue;
      }

      // Skip if already exists as a client under the target org
      if (existingNames.has(orgName.toLowerCase())) {
        skipped.push({
          id: org.id,
          name: orgName,
          reason: 'Client with this name already exists',
        });
        continue;
      }

      // Skip if this IS the target organization
      if (org.id === targetOrganizationId) {
        skipped.push({
          id: org.id,
          name: orgName,
          reason: 'Cannot migrate target organization to itself',
        });
        continue;
      }

      // Map org fields → client fields
      const clientData: Record<string, any> = {
        name: orgName,
        organization: targetOrganizationId,
        status: org.status === 'published' ? 'active' : org.status === 'archived' ? 'inactive' : 'active',
        website: org.website || null,
        logo: org.logo || null,
        industry: org.industry || null,
        notes: org.notes || null,
        tags: org.tags || null,
      };

      if (dryRun) {
        migrated.push({
          sourceOrgId: org.id,
          sourceOrgName: orgName,
          clientData,
          action: 'WOULD CREATE',
        });
      } else {
        try {
          const newClient = await directus.request(
            createItem('clients', clientData),
          );

          migrated.push({
            sourceOrgId: org.id,
            sourceOrgName: orgName,
            newClientId: (newClient as any).id,
            action: 'CREATED',
          });

          // Track the name to prevent duplicates within this batch
          existingNames.add(orgName.toLowerCase());
        } catch (err: any) {
          errors.push({
            sourceOrgId: org.id,
            sourceOrgName: orgName,
            error: err.message || 'Failed to create client',
          });
        }
      }
    }

    return {
      dryRun,
      message: dryRun
        ? `Dry run complete. ${migrated.length} organizations would be migrated. Set dryRun: false to execute.`
        : `Migration complete. ${migrated.length} clients created.`,
      targetOrganizationId,
      totalClientOrgsFound: clientOrgs.length,
      migrated,
      skipped,
      errors,
    };
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('[migrate-orgs-to-clients] Error:', error);
    throw createError({
      statusCode: 500,
      message: error.message || 'Migration failed',
    });
  }
});
