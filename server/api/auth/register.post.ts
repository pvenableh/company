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

import { createUser, createItem, readItems, deleteItem, deleteItems, deleteUser } from '@directus/sdk';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_METADATA } from '~~/shared/permissions';
import type { RoleSlug } from '~~/shared/permissions';
import { ensureContactForUser } from '~~/server/utils/contact-sync';

const SYSTEM_ROLES: RoleSlug[] = ['owner', 'admin', 'manager', 'member', 'client'];

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { email, password, first_name, last_name, phone, organization_name, terms_accepted, referred_by } = body;

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

    if (!terms_accepted) {
      throw createError({
        statusCode: 400,
        message: 'You must agree to the Terms of Service and Privacy Policy',
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
        terms_accepted_at: new Date().toISOString(),
        // Off: the app sends its own branded notification emails via SendGrid,
        // so Directus's native notification email would just be a raw duplicate.
        email_notifications: false,
      })
    );

    let organizationId: string | null = null;

    // 2. If organization_name is provided, create the full org setup
    if (organization_name?.trim()) {
      try {
        // Create organization. `slug` is required by the schema; derive it
        // from the name and append a short random suffix so two orgs with
        // matching names don't collide on the unique index.
        const slugBase = organization_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org';
        const slugSuffix = Math.random().toString(36).slice(2, 8);
        // Public signup no longer lands on a usable free tier. The org is created
        // capped (zero AI/scan limits — no unmetered-token leak) and flagged
        // `subscription_status: 'incomplete'`, the sentinel the onboarding gate
        // (app/middleware/subscription.global.ts) routes to /organization/new so
        // the owner must pick a plan and start the 14-day trial. `free` stays the
        // transient pre-plan tier (internal-only for public selection); the trial
        // webhook raises plan + limits once a plan is chosen.
        const org = await directus.request(
          createItem('organizations', {
            name: organization_name.trim(),
            slug: `${slugBase}-${slugSuffix}`,
            status: 'published',
            active: true,
            plan: 'free',
            subscription_status: 'incomplete',
            ai_token_limit_monthly: 0,
            scan_credits_limit_monthly: 0,
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

        // Create the team-member contact + org junction so the new user
        // appears in mention pickers, scheduler invitee lists, and anywhere
        // else that reads from `contacts`. Uses the shared helper so we get
        // the same find-by-user → find-by-email-and-adopt → create resolution
        // order as the invite flow.
        try {
          await ensureContactForUser({
            directus,
            organizationId: org.id,
            userId: newUser.id,
            email,
            firstName: first_name,
            lastName: last_name,
            phone: phone || null,
            source: 'registration',
          });
        } catch (contactError: any) {
          console.error('[Registration] Team-member contact creation failed (non-fatal):', contactError?.message);
        }
      } catch (orgError: any) {
        // Previously this was swallowed and registration returned success:true
        // with a broken org — if the role-seeding loop threw before the owner
        // membership was written, the "owner" had an org but NO membership and
        // was silently locked out of every requireOrgPermission-gated feature
        // with no error and no retry path. Instead, roll the whole bootstrap
        // back (best-effort) so the state is clean, then fail loudly so the
        // client can surface the error and the user can retry from scratch.
        console.error('[Registration] Org setup failed — rolling back:', orgError?.message);
        try {
          if (organizationId) {
            for (const coll of ['org_memberships', 'org_roles'] as const) {
              const rows = (await directus.request(readItems(coll, {
                filter: { organization: { _eq: organizationId } }, fields: ['id'], limit: -1,
              })).catch(() => [])) as Array<{ id: string }>;
              if (rows.length) await directus.request(deleteItems(coll, rows.map((r) => r.id))).catch(() => {});
            }
            const junctions = (await directus.request(readItems('organizations_directus_users', {
              filter: { organizations_id: { _eq: organizationId } }, fields: ['id'], limit: -1,
            })).catch(() => [])) as Array<{ id: number | string }>;
            if (junctions.length) await directus.request(deleteItems('organizations_directus_users', junctions.map((r) => r.id))).catch(() => {});
            await directus.request(deleteItem('organizations', organizationId)).catch(() => {});
          }
          // Delete the just-created user last, so a retry with the same email
          // isn't blocked by the unique-email guard on an orphaned account.
          await directus.request(deleteUser(newUser.id)).catch(() => {});
        } catch (rollbackErr: any) {
          console.error('[Registration] Rollback incomplete:', rollbackErr?.message);
        }
        throw createError({
          statusCode: 500,
          message: 'We could not finish setting up your account. Please try again.',
        });
      }
    }

    // 2b. Referral attribution — if this org was created via a subscriber's
    // referral link (`?ref=<orgId>`), stamp the NEW org's Stripe customer with
    // `referred_by_org`. This is the attribution store; payout happens later on
    // paid conversion in the Stripe webhook (server/utils/referral-reward.ts).
    // Creating the org customer now also means the later subscription reuses it
    // (getOrCreateOrgStripeCustomer), so the attribution survives to reward time.
    if (organizationId && typeof referred_by === 'string' && referred_by && referred_by !== organizationId) {
      try {
        const referrers = (await directus.request(
          readItems('organizations', {
            filter: { id: { _eq: referred_by }, active: { _neq: false } },
            fields: ['id'],
            limit: 1,
          })
        )) as any[];
        if (referrers.length) {
          const stripe = useStripe();
          const orgCustomer = await stripe.customers.create({
            name: organization_name?.trim() || undefined,
            email,
            metadata: {
              organization_id: organizationId,
              source: 'earnest_registration',
              referred_by_org: referred_by,
            },
          });
          const { updateItem } = await import('@directus/sdk');
          await directus.request(
            updateItem('organizations', organizationId, { stripe_customer_id: orgCustomer.id })
          );
          console.log(`[Registration] Referral attributed: org ${organizationId} referred by ${referred_by}`);
        }
      } catch (refErr: any) {
        console.error('[Registration] Referral attribution failed (non-fatal):', refErr?.message);
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
