/**
 * Apply a Stripe DISPUTE (chargeback) to the internal ledger + notify staff.
 *
 * Companion to apply-refund-adjustment.ts, called from the Connect webhook
 * (server/api/stripe/connect-webhook.post.ts) on charge.dispute.created and
 * charge.dispute.closed.
 *
 * Model, mirroring the refund pattern:
 *   - created: the money is HELD by Stripe but not yet lost, so we do NOT touch
 *     the invoice total — we only mark the original payments_received row
 *     `stripe_status='disputed'` (display) and notify the org's owner/admins so
 *     they can submit evidence.
 *   - closed + won: restore the row to `succeeded`; the payment stands.
 *   - closed + lost: the funds are reversed for real, so we book a NEGATIVE
 *     `payments_received` row (status='paid', stripe_status='dispute_lost') for
 *     the disputed amount and recompute the invoice — exactly how a refund nets
 *     down. Idempotent: skip if a dispute adjustment row already exists.
 *
 * Best-effort throughout — never 500 the webhook (Stripe retries), so the
 * caller wraps in try/catch and we swallow non-critical failures.
 *
 * ⚠️ SCAFFOLD: created/closed logic + notifications are implemented, but this
 * needs (1) the Stripe webhook endpoint subscribed to `charge.dispute.closed`
 * (verify in the Stripe dashboard — the current set may only have
 * dispute.created), and (2) end-to-end tests with Stripe test-mode disputes.
 */
import Stripe from 'stripe';
import { createItem, readItems, updateItem, createNotification } from '@directus/sdk';
import { recomputeInvoiceStatus } from '~~/server/utils/recompute-invoice-status';

const idOf = (ref: any): string | null =>
  ref == null ? null : typeof ref === 'object' ? ref.id ?? null : String(ref);

type PaymentRow = {
  id: string;
  invoice_id?: any;
  amount?: string | null;
  organization?: any;
  note?: string | null;
  stripe_status?: string | null;
  livemode?: boolean | null;
};

async function findChargeRows(directus: any, dispute: Stripe.Dispute) {
  const chargeId = idOf(dispute.charge);
  const piId = idOf(dispute.payment_intent);
  const rows = (await directus.request(
    readItems('payments_received', {
      filter: {
        _or: [
          ...(piId ? [{ payment_intent: { _eq: piId } } as any] : []),
          ...(chargeId ? [{ charge_id: { _eq: chargeId } } as any] : []),
        ],
      },
      fields: ['id', 'invoice_id', 'amount', 'organization', 'note', 'stripe_status', 'livemode'],
      limit: -1,
    }),
  )) as PaymentRow[];
  return { rows, chargeId, piId };
}

/** Notify the org's active owners/admins. Mirrors the agency-rating fanout. */
async function notifyOrgAdmins(directus: any, orgId: string | null, subject: string, message: string) {
  if (!orgId) return;
  try {
    const admins = (await directus.request(
      readItems('org_memberships', {
        filter: {
          organization: { _eq: orgId },
          status: { _eq: 'active' },
          role: { slug: { _in: ['owner', 'admin'] } },
        },
        fields: ['user'],
        limit: 100,
      }),
    )) as Array<{ user: any }>;
    const recipients = [...new Set(admins.map((a) => idOf(a.user)).filter(Boolean))] as string[];
    await Promise.all(
      recipients.map((recipient) =>
        directus.request(createNotification({ recipient, subject, message, collection: 'invoices', status: 'inbox' } as any)),
      ),
    );
  } catch (e) {
    console.warn('[Dispute] admin notify failed:', e);
  }
}

const appendNote = (existing: string | null | undefined, line: string) =>
  [existing?.trim(), line].filter(Boolean).join('\n');

export async function handleDisputeCreated(dispute: Stripe.Dispute, orgId: string | null) {
  const directus = getTypedDirectus();
  const { rows, chargeId } = await findChargeRows(directus, dispute);
  const original = rows.find((r) => Number(r.amount || 0) > 0);
  const amount = (dispute.amount / 100).toFixed(2);

  if (original && original.stripe_status !== 'disputed') {
    await directus
      .request(updateItem('payments_received', original.id, {
        stripe_status: 'disputed',
        note: appendNote(original.note, `Dispute opened ${new Date().toISOString().slice(0, 10)}: $${amount} (${dispute.reason})`),
      }))
      .catch((e: any) => console.warn('[Dispute] could not mark original row disputed:', e));
  }

  await notifyOrgAdmins(
    directus,
    orgId,
    'Payment disputed',
    `A $${amount} payment was disputed (${dispute.reason}). The funds are held pending resolution — submit evidence in Stripe if this is invalid.`,
  );
  console.warn(`[Stripe Connect] dispute.created ${dispute.id} (org ${orgId || 'unknown'}, $${amount}, ${dispute.reason})`);
  return { marked: !!original };
}

export async function handleDisputeClosed(dispute: Stripe.Dispute, orgId: string | null) {
  const directus = getTypedDirectus();
  const { rows, chargeId, piId } = await findChargeRows(directus, dispute);
  const original = rows.find((r) => Number(r.amount || 0) > 0);
  const amount = (dispute.amount / 100).toFixed(2);

  // Won (or warning_closed): the payment stands — restore display state.
  if (dispute.status === 'won' || dispute.status === 'warning_closed') {
    if (original) {
      await directus
        .request(updateItem('payments_received', original.id, {
          stripe_status: 'succeeded',
          note: appendNote(original.note, `Dispute ${dispute.status} ${new Date().toISOString().slice(0, 10)} — payment restored`),
        }))
        .catch(() => {});
    }
    await notifyOrgAdmins(directus, orgId, 'Dispute resolved in your favor', `The $${amount} dispute closed as "${dispute.status}". The payment stands.`);
    console.log(`[Stripe Connect] dispute.closed ${dispute.id} → ${dispute.status} (restored)`);
    return { outcome: dispute.status, applied: false };
  }

  // Lost: funds reversed for real → book a negative adjustment + recompute.
  // Idempotency: skip if we've already booked a dispute adjustment for this charge.
  const alreadyBooked = rows.some((r) => Number(r.amount || 0) < 0 && (r.stripe_status || '').startsWith('dispute'));
  if (alreadyBooked) {
    console.log(`[Dispute] lost already booked for charge ${chargeId} — idempotent no-op`);
    return { outcome: 'lost', applied: false };
  }

  const invoiceId = original ? idOf(original.invoice_id) : null;
  const rowOrg = orgId ?? (original ? idOf(original.organization) : null);

  await directus.request(
    createItem('payments_received', {
      payment_intent: piId,
      charge_id: chargeId,
      stripe_status: 'dispute_lost',
      amount: `-${amount}`,
      invoice_id: invoiceId,
      organization: rowOrg,
      status: 'paid',
      date_received: new Date().toISOString(),
      note: `Dispute lost — $${amount} reversed for charge ${chargeId || piId}`,
      livemode: original?.livemode ?? null,
    } as any),
  );
  if (original) {
    await directus
      .request(updateItem('payments_received', original.id, { stripe_status: 'dispute_lost' }))
      .catch(() => {});
  }

  let newInvoiceStatus: string | null = null;
  if (invoiceId) newInvoiceStatus = (await recomputeInvoiceStatus(invoiceId)).newStatus;

  await notifyOrgAdmins(
    directus,
    orgId,
    'Dispute lost',
    `The $${amount} dispute was lost. The payment was reversed${invoiceId ? ` and the invoice reopened (${newInvoiceStatus})` : ''}.`,
  );
  console.log(`[Stripe Connect] dispute.closed ${dispute.id} → lost, reversed $${amount}${invoiceId ? ` (invoice ${invoiceId} → ${newInvoiceStatus})` : ''}`);
  return { outcome: 'lost', applied: true, invoiceId, newInvoiceStatus };
}
