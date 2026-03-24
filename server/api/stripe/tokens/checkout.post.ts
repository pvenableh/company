/**
 * POST /api/stripe/tokens/checkout
 * Creates a Stripe Checkout Session for purchasing additional AI token packages.
 *
 * Body: { email, customerId?, packageId, organizationId, successUrl?, cancelUrl? }
 */
import { TOKEN_PACKAGES } from '~/server/utils/stripe';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const stripe = useStripe();
  const body = await readBody(event);
  const { email, customerId, packageId, organizationId, successUrl, cancelUrl } = body;

  if (!email) {
    throw createError({ statusCode: 400, message: 'Email is required' });
  }
  if (!packageId) {
    throw createError({ statusCode: 400, message: 'packageId is required' });
  }
  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  const pkg = TOKEN_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) {
    throw createError({ statusCode: 400, message: 'Invalid package ID' });
  }

  try {
    // Find or create Stripe customer
    let customer = customerId;
    if (!customer) {
      const existing = await stripe.customers.search({
        query: `email:"${email}"`,
      });
      if (existing.data.length > 0) {
        customer = existing.data[0].id;
      } else {
        const newCustomer = await stripe.customers.create({
          email,
          metadata: { source: 'earnest_tokens' },
        });
        customer = newCustomer.id;
      }
    }

    // Create one-time payment checkout for token package
    const checkoutSession = await stripe.checkout.sessions.create({
      customer,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `AI Token Package — ${pkg.name}`,
              description: `${formatTokens(pkg.tokens)} AI tokens for your organization`,
            },
            unit_amount: pkg.priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'token_purchase',
        package_id: pkg.id,
        tokens: String(pkg.tokens),
        organization_id: organizationId,
        user_id: userId,
      },
      success_url: successUrl || `${process.env.APP_URL || 'http://localhost:3000'}/organization?tab=ai-usage&tokens_purchased=true`,
      cancel_url: cancelUrl || `${process.env.APP_URL || 'http://localhost:3000'}/organization?tab=ai-usage`,
    });

    return { sessionId: checkoutSession.id, url: checkoutSession.url };
  } catch (error: any) {
    console.error('[stripe/tokens/checkout] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to create token purchase checkout',
    });
  }
});

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
