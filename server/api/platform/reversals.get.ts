// server/api/platform/reversals.get.ts
/**
 * GET /api/platform/reversals
 *
 * Refunds & disputes across BOTH money surfaces, for the /platform console
 * (Earnest creator only):
 *   - INVOICE payments (per-org client revenue): the negative refund/dispute
 *     adjustment rows in `payments_received` (stripe_status refund/dispute_lost)
 *     plus any open disputes (stripe_status 'disputed', funds held).
 *   - PLATFORM charges (Earnest's own token/subscription revenue): the
 *     `platform_reversals` audit ledger (token clawbacks + subscription flags).
 *
 * Returns a unified, newest-first list + headline totals.
 */
import { readItems } from '@directus/sdk';
import { requirePlatformAdmin } from '~~/server/utils/platform';

interface ReversalItem {
  source: 'invoice' | 'platform';
  type: string;
  orgId: string | null;
  orgName: string | null;
  amount: number; // dollars, positive magnitude
  tokens: number | null;
  reason: string | null;
  status: string | null;
  date: string | null;
}

export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event);
  const directus = getServerDirectus();

  const [orgs, invoiceRows, platformRows] = await Promise.all([
    directus.request(
      readItems('organizations', { fields: ['id', 'name'], limit: -1 }),
    ) as Promise<Array<{ id: string; name: string }>>,
    directus.request(
      readItems('payments_received', {
        filter: { stripe_status: { _in: ['refund', 'dispute_lost', 'disputed'] } },
        fields: ['id', 'organization', 'amount', 'stripe_status', 'note', 'date_received', 'date_created', 'invoice_id'],
        limit: -1,
      }),
    ) as Promise<Array<any>>,
    directus.request(
      readItems('platform_reversals', {
        fields: ['id', 'type', 'organization', 'amount_cents', 'tokens_clawed_back', 'reason', 'note', 'date_created'],
        sort: ['-date_created'],
        limit: -1,
      }),
    ) as Promise<Array<any>>,
  ]);

  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  const items: ReversalItem[] = [];

  // Invoice-side. Negative adjustment rows carry the reversed magnitude; the
  // 'disputed' rows are positive originals whose funds are held pending outcome.
  let invoiceRefunded = 0;
  let openDisputes = 0;
  for (const r of invoiceRows || []) {
    const amt = Number(r.amount ?? 0);
    const ss = String(r.stripe_status || '');
    if (ss === 'disputed') {
      openDisputes++;
      items.push({
        source: 'invoice',
        type: 'invoice_dispute_open',
        orgId: r.organization ?? null,
        orgName: orgName.get(r.organization) ?? null,
        amount: Math.abs(amt),
        tokens: null,
        reason: null,
        status: 'held',
        date: r.date_received ?? r.date_created ?? null,
      });
      continue;
    }
    // refund / dispute_lost negative rows
    invoiceRefunded += Math.abs(amt);
    items.push({
      source: 'invoice',
      type: ss === 'dispute_lost' ? 'invoice_dispute_lost' : 'invoice_refund',
      orgId: r.organization ?? null,
      orgName: orgName.get(r.organization) ?? null,
      amount: Math.abs(amt),
      tokens: null,
      reason: null,
      status: ss,
      date: r.date_received ?? r.date_created ?? null,
    });
  }

  // Platform-side (token + subscription).
  let platformReversed = 0;
  let tokensClawedBack = 0;
  for (const r of platformRows || []) {
    const dollars = (Number(r.amount_cents ?? 0)) / 100;
    platformReversed += dollars;
    tokensClawedBack += Number(r.tokens_clawed_back ?? 0);
    items.push({
      source: 'platform',
      type: r.type ?? 'platform_reversal',
      orgId: r.organization ?? null,
      orgName: orgName.get(r.organization) ?? null,
      amount: dollars,
      tokens: r.tokens_clawed_back != null ? Number(r.tokens_clawed_back) : null,
      reason: r.reason ?? null,
      status: null,
      date: r.date_created ?? null,
    });
  }

  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return {
    totals: {
      invoiceRefunded: Math.round(invoiceRefunded),
      openDisputes,
      platformReversed: Math.round(platformReversed),
      tokensClawedBack,
      total: Math.round(invoiceRefunded + platformReversed),
    },
    items,
  };
});
