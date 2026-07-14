/**
 * POST /api/stripe/tokens/fulfill
 * Fast-path token crediting called by the client success page. The platform
 * webhook (checkout.session.completed) is the reliable path; this just makes
 * the balance show up immediately when the buyer lands back in-app. Both share
 * `fulfillTokenPurchase`, which is idempotent — whichever runs second no-ops.
 *
 * Body: { sessionId } (Stripe checkout session ID)
 */
import { fulfillTokenPurchase } from '~~/server/utils/fulfill-token-purchase';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { sessionId } = body;

  if (!sessionId) {
    throw createError({ statusCode: 400, message: 'sessionId is required' });
  }

  const stripe = useStripe();

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    if (checkoutSession.payment_status !== 'paid') {
      throw createError({ statusCode: 400, message: 'Payment not completed' });
    }
    if (checkoutSession.metadata?.type !== 'token_purchase') {
      throw createError({ statusCode: 400, message: 'Not a token purchase session' });
    }

    const result = await fulfillTokenPurchase(stripe, checkoutSession);

    if (!result.success) {
      throw createError({ statusCode: 400, message: `Invalid token purchase (${result.reason || 'unknown'})` });
    }

    return {
      success: true,
      tokensAdded: result.tokensAdded ?? 0,
      newBalance: result.newBalance,
      organizationId: result.organizationId,
      alreadyFulfilled: result.alreadyFulfilled ?? false,
    };
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('[stripe/tokens/fulfill] Error:', error);
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fulfill token purchase',
    });
  }
});
