// server/api/auth/register.post.ts
/**
 * Registration endpoint
 *
 * Creates a new Directus user. If `organization_name` is provided,
 * also creates an organization, seeds 5 system org_roles, and
 * creates an owner org_membership for the new user.
 *
 * Then auto-logs the user in and returns a session.
 */

import { createUser, createItem, readItems } from '@directus/sdk';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_METADATA } from '~~/shared/permissions';
import type { RoleSlug } from '~~/shared/permissions';

const SYSTEM_ROLES: RoleSlug[] = ['owner', 'admin', 'manager', 'member', 'client'];

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { email, password, first_name, last_name, phone, organization_name } = body;

    if (!email || !password) {
      throw createError({
        statusCode: 400,
        message: 'Email and password are required',
      });
    }

    if (!first_name || !last_name) {
      throw createError({
        statusCode: 400,
        message: 'First name and last name are required',
      });
    }

    const directus = getServerDirectus();
    const config = useRuntimeConfig();

    // Get default role for new users
    const defaultRoleId = config.public.directusRoleUser || null;

    // 1. Create the Directus user
    const newUser = await directus.request(
      createUser({
        email,
        password,
        first_name,
        last_name,
        phone: phone || null,
        status: 'active',
        role: defaultRoleId,
      })
    );

    let organizationId: string | null = null;

    // 2. If organization_name is provided, create the full org setup
    if (organization_name?.trim()) {
      try {
        // Create organization
        const org = await directus.request(
          createItem('organizations', {
            name: organization_name.trim(),
            status: 'published',
            active: true,
            plan: 'free',
          })
        ) as any;

        organizationId = org.id;

        // Link user to org via legacy junction (backward compat)
        await directus.request(
          createItem('organizations_directus_users', {
            organizations_id: org.id,
            directus_users_id: newUser.id,
          })
        );

        // Seed system roles for the org
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

        // Create owner membership for the registering user
        await directus.request(
          createItem('org_memberships', {
            organization: org.id,
            user: newUser.id,
            role: createdRoles['owner'],
            status: 'active',
            accepted_at: new Date().toISOString(),
          })
        );
      } catch (orgError: any) {
        // Log but don't fail registration if org setup fails
        console.error('Org setup error (user was still created):', orgError);
      }
    }

    // 3. Create Stripe customer for billing
    try {
      const stripe = useStripe();
      const stripeCustomer = await stripe.customers.create({
        email,
        name: `${first_name} ${last_name}`,
        metadata: {
          directus_user_id: newUser.id,
          organization_id: organizationId || '',
          source: 'earnest_registration',
        },
      });

      // Save stripe_customer_id to user profile
      const { updateUser } = await import('@directus/sdk');
      await directus.request(
        updateUser(newUser.id, {
          stripe_customer_id: stripeCustomer.id,
        })
      );

      console.log(`[Registration] Stripe customer created: ${stripeCustomer.id} for user ${newUser.id}`);
    } catch (stripeError: any) {
      // Don't fail registration if Stripe fails — user can link later
      console.error('[Registration] Stripe customer creation failed (non-fatal):', stripeError.message);
    }

    // 4. Auto-login the new user
    const tokens = await directusLogin(email, password);
    const userData = await directusGetMe(tokens.access_token, [
      '*',
      'role.id',
      'role.name',
      'avatar.id',
    ]);

    await createUserSession(
      event,
      {
        id: userData.id,
        email: userData.email,
        first_name: userData.first_name,
        last_name: userData.last_name,
        avatar: typeof userData.avatar === 'object' ? userData.avatar?.id : userData.avatar,
        role: userData.role,
      },
      tokens
    );

    return {
      success: true,
      message: 'Registration successful',
      user: {
        id: newUser.id,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
      },
      organization: organizationId ? { id: organizationId, name: organization_name } : null,
    };
  } catch (error: any) {
    console.error('Registration error:', error);

    if (error.errors?.[0]?.message?.includes('unique')) {
      throw createError({
        statusCode: 409,
        message: 'An account with this email already exists',
      });
    }

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Registration failed',
    });
  }
});
