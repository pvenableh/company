/**
 * Get AI token plan info for the current subscription.
 * Returns plan-level allocations and available token packages.
 *
 * Query: organizationId (optional)
 */
import { EARNEST_PLANS, TOKEN_PACKAGES } from '~/server/utils/stripe';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  // Return plan definitions and token packages
  const plans = Object.entries(EARNEST_PLANS).map(([id, plan]) => ({
    id,
    name: plan.name,
    monthlyAmount: plan.monthlyAmount,
    aiTokens: plan.aiTokens,
  }));

  const packages = TOKEN_PACKAGES.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    tokens: pkg.tokens,
    priceInCents: pkg.priceInCents,
  }));

  return { plans, packages };
});
