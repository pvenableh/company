/**
 * POST /api/stripe/tokens/fulfill
 * Webhook handler to credit AI tokens to an organization after successful Stripe payment.
 * Called by Stripe webhook (checkout.session.completed) or manually by admin.
 *
 * Body: { sessionId } (Stripe checkout session ID)
 */
import { readItem, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { sessionId } = body;

  if (!sessionId) {
    throw createError({ statusCode: 400, message: 'sessionId is required' });
  }

  const stripe = useStripe();

  try {
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    // Verify it's a completed token purchase
    if (checkoutSession.payment_status !== 'paid') {
      throw createError({ statusCode: 400, message: 'Payment not completed' });
    }

    const metadata = checkoutSession.metadata || {};
    if (metadata.type !== 'token_purchase') {
      throw createError({ statusCode: 400, message: 'Not a token purchase session' });
    }

    const tokensToAdd = Number(metadata.tokens);
    const organizationId = metadata.organization_id;

    if (!tokensToAdd || !organizationId) {
      throw createError({ statusCode: 400, message: 'Invalid token purchase metadata' });
    }

    // Check if already fulfilled (idempotency)
    if (metadata.fulfilled === 'true') {
      return { success: true, message: 'Already fulfilled', tokensAdded: tokensToAdd };
    }

    const directus = getTypedDirectus();

    // Credit tokens to organization
    const org = await directus.request(
      readItem('organizations', organizationId, {
        fields: ['ai_token_balance'],
      }),
    ) as any;

    const currentBalance = Number(org.ai_token_balance) || 0;
    await directus.request(
      updateItem('organizations', organizationId, {
        ai_token_balance: currentBalance + tokensToAdd,
      }),
    );

    // Mark as fulfilled in Stripe metadata to prevent double-crediting
    await stripe.checkout.sessions.update(sessionId, {
      metadata: { ...metadata, fulfilled: 'true' },
    } as any);

    return {
      success: true,
      tokensAdded: tokensToAdd,
      newBalance: currentBalance + tokensToAdd,
      organizationId,
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
