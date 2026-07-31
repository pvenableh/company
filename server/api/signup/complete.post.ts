// POST /api/signup/complete
// The commit step of the password-at-end public signup. Takes a draft token +
// the password the user just set, and in one shot:
//   1. creates the Directus user (email/name/password from the draft),
//   2. seeds the organization from the draft's wizard answers (roles, owner
//      membership, contact, folders, welcome email) via seedOrganizationForOwner,
//   3. creates the user's Stripe customer (+ referral attribution),
//   4. marks the draft `completed` and links the org,
//   5. logs the user in (sets the session cookies).
//
// The trial subscription is NOT created here — the client, now authenticated,
// calls the existing /api/stripe/subscription/create with the returned org id,
// so that battle-tested Stripe path stays the single source of truth.
import { createUser, readItems, updateItem, updateUser, deleteUser } from '@directus/sdk';
import { seedOrganizationForOwner } from '~~/server/utils/org-provision';

const VALID_PLANS = ['solo', 'studio', 'agency'];

function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(pw)) return 'Password must contain a number';
  return null;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ token?: string; password?: string; terms_accepted?: boolean }>(event);
  const { token, password, terms_accepted } = body || {};

  if (!token) throw createError({ statusCode: 400, message: 'Missing signup session' });
  if (!terms_accepted) throw createError({ statusCode: 400, message: 'You must agree to the Terms of Service and Privacy Policy' });
  const pwProblem = passwordProblem(password);
  if (pwProblem) throw createError({ statusCode: 400, message: pwProblem });

  const directus = getServerDirectus();
  const config = useRuntimeConfig();

  // 1. Load the draft
  const rows = (await directus.request(
    readItems('signup_drafts', {
      filter: { token: { _eq: token } },
      fields: ['id', 'email', 'first_name', 'last_name', 'state', 'status'],
      limit: 1,
    }),
  )) as Array<{ id: number; email: string | null; first_name: string | null; last_name: string | null; state: Record<string, any> | null; status: string | null }>;
  const draft = rows[0];
  if (!draft) throw createError({ statusCode: 404, message: 'Signup session not found' });
  if (draft.status === 'completed') throw createError({ statusCode: 410, message: 'This signup is already complete' });

  const email = (draft.email || '').trim().toLowerCase();
  if (!email) throw createError({ statusCode: 400, message: 'This signup is missing an email — please start over' });
  const firstName = draft.first_name || '';
  const lastName = draft.last_name || '';
  const state = draft.state || {};

  const orgName = (state.orgName || '').trim();
  if (!orgName) throw createError({ statusCode: 400, message: 'Please name your organization before finishing' });
  const plan = VALID_PLANS.includes(state.selectedPlan) ? state.selectedPlan : 'solo';
  const interval = state.selectedInterval === 'annual' ? 'annual' : 'monthly';
  const referredBy = typeof state.referredBy === 'string' ? state.referredBy : null;

  // 2. Create the user
  let newUser: any;
  try {
    newUser = await directus.request(
      createUser({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        status: 'active',
        role: config.public.directusRoleUser || null,
        terms_accepted_at: new Date().toISOString(),
        email_notifications: false,
      }),
    );
  } catch (err: any) {
    if (err?.errors?.[0]?.message?.includes('unique') || err?.message?.includes('unique')) {
      throw createError({ statusCode: 409, message: 'An account with this email already exists — please sign in instead.' });
    }
    console.error('[signup/complete] user creation failed:', err?.message);
    throw createError({ statusCode: 500, message: 'Could not create your account. Please try again.' });
  }

  // 3. Seed the organization from the draft's answers
  let org: { id: string; name: string };
  try {
    const slugBase = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org';
    const slugSuffix = Math.random().toString(36).slice(2, 8);
    const orgData: Record<string, any> = {
      name: orgName,
      slug: `${slugBase}-${slugSuffix}`,
      status: 'published',
      active: true,
      plan,
      // Start capped + incomplete; the trial subscription (created next by the
      // client) + its webhook raise plan/limits and flip subscription_status.
      ai_token_limit_monthly: 0,
      scan_credits_limit_monthly: 0,
      subscription_status: 'incomplete',
    };
    if (state.selectedIndustry) orgData.industry = state.selectedIndustry;
    if (state.orgLocation?.trim?.()) orgData.location = state.orgLocation.trim();
    if (state.orgWebsite?.trim?.()) orgData.website = state.orgWebsite.trim();
    if (state.orgBrandColor?.trim?.()) orgData.brand_color = state.orgBrandColor.trim();
    if (state.brandDirection?.trim?.()) orgData.brand_direction = state.brandDirection.trim();
    if (state.targetAudience?.trim?.()) orgData.target_audience = state.targetAudience.trim();
    if (typeof state.goals === 'string' && state.goals.trim()) orgData.goals = state.goals.trim();
    if (typeof state.expectations === 'string' && state.expectations.trim()) orgData.expectations = state.expectations.trim();

    org = await seedOrganizationForOwner(
      directus,
      { id: newUser.id, email, firstName, lastName },
      orgData,
      plan,
    );
  } catch (seedErr: any) {
    // Org seeding already rolled itself back. Delete the just-created user too so
    // a retry with the same email isn't blocked by the unique-email guard.
    await directus.request(deleteUser(newUser.id)).catch(() => {});
    throw seedErr?.statusCode ? seedErr : createError({ statusCode: 500, message: 'We could not finish setting up your workspace. Please try again.' });
  }

  // 4. Stripe customer for the user (+ referral attribution on the org customer)
  try {
    const stripe = useStripe();
    if (referredBy && referredBy !== org.id) {
      const referrers = (await directus.request(
        readItems('organizations', { filter: { id: { _eq: referredBy }, active: { _neq: false } }, fields: ['id'], limit: 1 }),
      ).catch(() => [])) as any[];
      if (referrers.length) {
        const orgCustomer = await stripe.customers.create({
          name: orgName,
          email,
          metadata: { organization_id: org.id, source: 'earnest_signup_complete', referred_by_org: referredBy },
        });
        await directus.request(updateItem('organizations', org.id, { stripe_customer_id: orgCustomer.id })).catch(() => {});
      }
    }
    const userCustomer = await stripe.customers.create({
      email,
      name: `${firstName} ${lastName}`.trim() || undefined,
      metadata: { directus_user_id: newUser.id, organization_id: org.id, source: 'earnest_signup_complete' },
    });
    await directus.request(updateUser(newUser.id, { stripe_customer_id: userCustomer.id })).catch(() => {});
  } catch (stripeErr: any) {
    console.error('[signup/complete] Stripe customer creation failed (non-fatal):', stripeErr?.message);
  }

  // 5. Mark the draft completed + link the org
  await directus.request(
    updateItem('signup_drafts', draft.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      organization: org.id,
    }),
  ).catch((e: any) => console.warn('[signup/complete] draft close failed (non-fatal):', e?.message));

  // 6. Log the user in
  const tokens = await directusLogin(email, password);
  const userData = await directusGetMe(tokens.access_token, ['*', 'role.id', 'role.name', 'avatar.id']);
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
    tokens,
  );

  return {
    success: true,
    organization: { id: org.id, name: org.name },
    plan,
    interval,
  };
});
