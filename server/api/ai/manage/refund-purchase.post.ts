/**
 * Refund an AI-token purchase — org-admin action.
 *
 * Refunds the Stripe charge on the platform account, reverses the granted tokens
 * from the org balance (floored at 0 — we never claw a balance negative for
 * tokens already spent), and marks the `token_purchases` ledger row `refunded`.
 *
 * Ordering is chosen so the worst-case failure favors the customer: refund →
 * mark refunded → deduct. A retry after the status flip 409s (no double refund /
 * double deduction); a crash before the deduct leaves the org holding some
 * refunded tokens (org-favorable) rather than double-charging tokens.
 *
 * Body: { organizationId, purchaseId }
 */
import { readItem, updateItem } from '@directus/sdk';

interface RefundBody {
  organizationId?: string;
  purchaseId?: string;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RefundBody>(event);
  const { organizationId, purchaseId } = body;
  if (!organizationId || !purchaseId) {
    throw createError({ statusCode: 400, message: 'organizationId and purchaseId are required' });
  }

  // Real money moves — block demo accounts, require org-admin update rights.
  await requireNotDemoSession(event);
  await requireOrgPermission(event, organizationId, 'ai_usage', 'update');

  const stripe = useStripe();
  const directus = getTypedDirectus();

  const purchase = (await directus.request(
    readItem('token_purchases', purchaseId, {
      fields: ['id', 'organization', 'tokens', 'amount_cents', 'currency', 'stripe_payment_intent', 'status'],
    }),
  )) as any;

  if (!purchase) throw createError({ statusCode: 404, message: 'Purchase not found' });
  if (purchase.organization !== organizationId) {
    throw createError({ statusCode: 403, message: 'Purchase belongs to another organization' });
  }
  if (purchase.status === 'refunded') {
    throw createError({ statusCode: 409, message: 'This purchase has already been refunded' });
  }
  if (!purchase.stripe_payment_intent) {
    throw createError({ statusCode: 400, message: 'No Stripe payment intent on this purchase — refund manually in Stripe.' });
  }

  // 1) Issue the Stripe refund (platform account). Idempotency key makes retries
  //    return the same refund instead of stacking a second one.
  let refund: any = null;
  try {
    refund = await stripe.refunds.create(
      {
        payment_intent: purchase.stripe_payment_intent,
        reason: 'requested_by_customer',
        metadata: { earnest_token_refund: '1', organization_id: organizationId, purchase_id: purchaseId },
      },
      { idempotencyKey: `token-refund-${purchaseId}` },
    );
  } catch (err: any) {
    if (err?.code === 'charge_already_refunded') {
      // Stripe side is already refunded — reconcile our records below.
    } else {
      throw createError({ statusCode: err?.statusCode || 502, message: err?.message || 'Stripe refund failed' });
    }
  }

  // 2) Mark the ledger row refunded (the idempotency guard for retries).
  await directus.request(updateItem('token_purchases', purchaseId, { status: 'refunded' }));

  // 3) Reverse the granted tokens from the org balance (floor at 0).
  const org = (await directus.request(
    readItem('organizations', organizationId, { fields: ['ai_token_balance'] }),
  )) as any;
  const tokensReversed = Number(purchase.tokens) || 0;
  const newBalance = Math.max(0, (Number(org?.ai_token_balance) || 0) - tokensReversed);
  await directus.request(updateItem('organizations', organizationId, { ai_token_balance: newBalance }));

  return {
    success: true,
    refundId: refund?.id ?? null,
    amountRefundedCents: refund?.amount ?? purchase.amount_cents ?? 0,
    tokensReversed,
    newBalance,
  };
});
