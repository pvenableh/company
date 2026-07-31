// POST /api/stripe/subscription/change-plan
// Switch an org's BASE plan (solo/studio/agency, monthly/annual) in place —
// in-app plan changes without the Stripe billing portal. Swaps the base plan
// line item's price with proration; add-on items are left untouched.
//
// The customer.subscription.updated webhook (paymentchange.ts) re-affirms plan +
// token limits authoritatively; the optimistic org write here makes it instant.
import { readItem, updateItem } from '@directus/sdk';
import { EARNEST_PLANS, TRIAL_AI_TOKEN_GRANT, planFromPriceId } from '~~/server/utils/stripe';
import type { EarnestPlanId } from '~~/server/utils/stripe';

const VALID_PLANS: EarnestPlanId[] = ['solo', 'studio', 'agency'];

export default defineEventHandler(async (event) => {
  const body = await readBody<{ organizationId: string; plan: EarnestPlanId; interval?: 'monthly' | 'annual' }>(event);
  const { organizationId, plan } = body;
  const interval = body.interval === 'annual' ? 'annual' : 'monthly';

  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });
  if (!VALID_PLANS.includes(plan)) throw createError({ statusCode: 400, message: `Unknown plan: ${plan}` });

  // Org-owned billing — owner/admin of THIS org only; never demo sessions.
  await requireOrgPermission(event, organizationId, 'org_settings', 'update');
  await requireNotDemoSession(event);

  const planDef = EARNEST_PLANS[plan];
  const priceId = interval === 'annual' ? planDef.stripePriceIdAnnual : planDef.stripePriceId;
  if (!priceId) {
    throw createError({ statusCode: 500, message: `Stripe price not configured for ${plan} ${interval}` });
  }

  const stripe = useStripe();
  const directus = getServerDirectus();

  const org = (await directus
    .request(readItem('organizations', organizationId, { fields: ['stripe_subscription_id', 'plan'] }))
    .catch(() => null)) as any;
  const subId = org?.stripe_subscription_id;
  if (!subId) {
    throw createError({ statusCode: 409, message: 'No active subscription to change. Start a plan first.' });
  }

  const sub = await stripe.subscriptions.retrieve(subId);
  if (!['active', 'trialing', 'past_due'].includes(sub.status)) {
    throw createError({ statusCode: 409, message: "Your subscription isn't active. Add a card or start a plan first." });
  }

  // The BASE plan item is the one whose price maps to a plan (add-ons map via
  // addonFromPriceId, so they won't match here).
  const baseItem = sub.items.data.find((i) => planFromPriceId(i.price?.id || ''));
  if (!baseItem) {
    throw createError({ statusCode: 409, message: 'Could not locate your plan on the subscription.' });
  }
  if (baseItem.price?.id === priceId) {
    return { ok: true, plan, unchanged: true, status: sub.status };
  }

  // Swap the base price. Proration bills the difference on the next invoice; a
  // trialing sub isn't charged until the trial ends.
  const updated = await stripe.subscriptions.update(subId, {
    items: [{ id: baseItem.id, price: priceId }],
    proration_behavior: 'create_prorations',
  });

  // Optimistically mirror plan + limits. A no-card trial keeps the bounded grant
  // regardless of plan; otherwise the new plan's full allotment applies.
  const noCardTrial = updated.status === 'trialing' && !updated.default_payment_method;
  await directus
    .request(
      updateItem('organizations', organizationId, {
        plan,
        ai_token_limit_monthly: noCardTrial ? TRIAL_AI_TOKEN_GRANT : planDef.aiTokens.monthlyAllotment,
        scan_credits_limit_monthly: planDef.scanCredits,
      }),
    )
    .catch((e: any) => console.warn('[change-plan] optimistic org update failed (non-fatal):', e?.message));

  return { ok: true, plan, interval, status: updated.status };
});
