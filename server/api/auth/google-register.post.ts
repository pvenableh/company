// server/api/auth/google-register.post.ts
/**
 * Google SSO Registration — Hybrid Flow
 *
 * Step 1: Client sends { first_name, last_name, organization_name }
 * Step 2: We create a placeholder directus_users record (no password, provider: 'google')
 * Step 3: We create the org, seed roles, create owner membership
 * Step 4: We create a Stripe customer
 * Step 5: We return the Google SSO URL for the client to redirect to
 *
 * When the user completes Google sign-in, Directus matches by email
 * (since ALLOW_PUBLIC_REGISTRATION=false, the user must already exist).
 * The SSO callback page then creates the session as usual.
 *
 * If the user abandons the Google sign-in, we have an orphaned user record
 * with status 'draft'. A cron job can clean these up periodically.
 */

import { createUser, createItem, updateUser } from '@directus/sdk';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_METADATA } from '~~/shared/permissions';
import type { RoleSlug } from '~~/shared/permissions';

const SYSTEM_ROLES: RoleSlug[] = ['owner', 'admin', 'manager', 'member', 'client'];

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { email, first_name, last_name, organization_name } = body;

    if (!email) {
      throw createError({ statusCode: 400, message: 'Email is required' });
    }
    if (!first_name || !last_name) {
      throw createError({ statusCode: 400, message: 'First and last name are required' });
    }
    if (!organization_name?.trim()) {
      throw createError({ statusCode: 400, message: 'Organization name is required' });
    }

    const directus = getServerDirectus();  // Same client as register.post.ts
    const config = useRuntimeConfig();
    const defaultRoleId = config.public.directusRoleUser || null;

    // 1. Create Directus user (no password — will authenticate via Google)
    //    Uses a random placeholder password since Directus requires one.
    //    The user will never use it — they'll always sign in with Google.
    const randomPlaceholder = crypto.randomUUID() + crypto.randomUUID();

    const newUser = await directus.request(
      createUser({
        email,
        password: randomPlaceholder,
        first_name,
        last_name,
        status: 'active',
        role: defaultRoleId,
        provider: 'google',
        // external_identifier will be set by Directus when they complete Google SSO
      })
    );

    let organizationId: string | null = null;

    // 2. Create organization + seed roles + owner membership
    try {
      const org = await directus.request(
        createItem('organizations', {
          name: organization_name.trim(),
          status: 'published',
          active: true,
          plan: 'free',
        })
      ) as any;

      organizationId = org.id;

      // Legacy junction (backward compat)
      await directus.request(
        createItem('organizations_directus_users', {
          organizations_id: org.id,
          directus_users_id: newUser.id,
        })
      );

      // Seed system roles
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

      // Owner membership
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
      console.error('[Google Register] Org setup error (user was still created):', orgError);
    }

    // 3. Create Stripe customer
    try {
      const stripe = useStripe();
      const stripeCustomer = await stripe.customers.create({
        email,
        name: `${first_name} ${last_name}`,
        metadata: {
          directus_user_id: newUser.id,
          organization_id: organizationId || '',
          source: 'earnest_google_registration',
        },
      });

      await directus.request(
        updateUser(newUser.id, {
          stripe_customer_id: stripeCustomer.id,
        })
      );
    } catch (stripeError: any) {
      console.error('[Google Register] Stripe customer creation failed (non-fatal):', stripeError.message);
    }

    // 4. Build the Google SSO URL for the client to redirect to
    const directusUrl = config.public.directusUrl || process.env.DIRECTUS_URL;
    const appUrl = config.public.siteUrl || '';
    const redirect = encodeURIComponent(`${appUrl}/auth/sso-callback`);
    const googleSsoUrl = `${directusUrl}/auth/login/google?redirect=${redirect}`;

    return {
      success: true,
      ssoUrl: googleSsoUrl,
      user: {
        id: newUser.id,
        email: newUser.email,
      },
      organization: organizationId ? { id: organizationId, name: organization_name } : null,
    };
  } catch (error: any) {
    console.error('[Google Register] Error:', error);

    if (error.errors?.[0]?.message?.includes('unique')) {
      throw createError({
        statusCode: 409,
        message: 'An account with this email already exists. Try signing in with Google instead.',
      });
    }

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Google registration failed',
    });
  }
});
