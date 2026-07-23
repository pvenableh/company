/**
 * Billing recipients — the ONE place that decides who an invoice email reaches.
 *
 * Source of truth = the client's contacts flagged `is_billing_contact`, ordered
 * by `sort` (lowest = primary/To). Everything else is legacy fallback, kept only
 * so un-migrated clients (whose recipients still live in the `billing_contacts`
 * JSON blob or the single `billing_email` scalar) keep working until the
 * `migrate-billing-contacts-to-rows` migration is applied.
 *
 * Precedence at a single client level:
 *   1. contacts where is_billing_contact + email  (ordered by sort, then name)   ← modern
 *   2. legacy billing_contacts JSON array (in array order)                        ← pre-migration
 *   3. billing_email single scalar                                                ← oldest
 *
 * Sub-brands: pass the parent_client chain (self first). The first level with any
 * recipient wins — matching the historical "billing falls back to parent" walk.
 *
 * Pure + dependency-free so both the server (send path) and the client (UI) call
 * the exact same logic and can never drift again.
 */

export interface BillingRecipient {
  email: string;
  name: string;
}

export interface ResolvedBilling {
  /** Primary recipient (To). Null when the client has no billing recipient. */
  to: BillingRecipient | null;
  /** Everyone else (Cc), in order. */
  cc: BillingRecipient[];
  /** to + cc, flattened. */
  all: BillingRecipient[];
}

/** Minimal shape a client "level" must provide. Extra fields are ignored. */
export interface ClientBillingSource {
  contacts?: Array<{
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    is_billing_contact?: boolean | null;
    sort?: number | null;
  } | string> | null;
  /** Legacy JSON blob (may arrive as a stringified array). */
  billing_contacts?: Array<{ name?: string | null; email?: string | null }> | string | null;
  billing_email?: string | null;
  billing_name?: string | null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function normEmail(e?: string | null): string {
  return String(e ?? '').trim();
}

export function isValidEmail(e?: string | null): boolean {
  return EMAIL_RE.test(normEmail(e));
}

function contactDisplayName(c: any): string {
  const full = `${c?.first_name ?? ''} ${c?.last_name ?? ''}`.trim();
  return full || String(c?.name ?? '').trim();
}

function dedupe(list: BillingRecipient[]): BillingRecipient[] {
  const seen = new Set<string>();
  const out: BillingRecipient[] = [];
  for (const r of list) {
    const key = r.email.toLowerCase();
    if (r.email && !seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

/**
 * The ordered billing recipients contributed by a SINGLE client level.
 * Returns [] when this level has none (callers then fall back to the parent).
 */
export function billingRecipientsFromLevel(level: ClientBillingSource | null | undefined): BillingRecipient[] {
  if (!level) return [];

  // 1. Modern: contacts flagged is_billing_contact, ordered by sort then name.
  const contacts = Array.isArray(level.contacts) ? level.contacts : [];
  const flagged = contacts
    .filter((c): c is Exclude<typeof c, string> =>
      !!c && typeof c === 'object' && !!(c as any).is_billing_contact && !!normEmail((c as any).email))
    .slice()
    .sort((a: any, b: any) => {
      const sa = a.sort ?? Number.MAX_SAFE_INTEGER;
      const sb = b.sort ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      return contactDisplayName(a).localeCompare(contactDisplayName(b));
    })
    .map((c: any) => ({ email: normEmail(c.email), name: contactDisplayName(c) }));
  if (flagged.length) return dedupe(flagged);

  // 2. Legacy JSON blob (array order).
  let json: any = level.billing_contacts;
  if (typeof json === 'string') {
    try { json = JSON.parse(json); } catch { json = []; }
  }
  if (Array.isArray(json)) {
    const fromJson = json
      .filter((c: any) => normEmail(c?.email))
      .map((c: any) => ({ email: normEmail(c.email), name: String(c?.name ?? '').trim() }));
    if (fromJson.length) return dedupe(fromJson);
  }

  // 3. Single scalar.
  const single = normEmail(level.billing_email);
  if (single) return [{ email: single, name: String(level.billing_name ?? '').trim() }];

  return [];
}

/**
 * Resolve To / Cc for a client. Pass a single client, or the parent_client chain
 * as an ordered array (self first) — the first level with any recipient wins.
 */
export function resolveBillingRecipients(
  levels: ClientBillingSource | ClientBillingSource[] | null | undefined,
): ResolvedBilling {
  const chain = Array.isArray(levels) ? levels : levels ? [levels] : [];
  let all: BillingRecipient[] = [];
  for (const level of chain) {
    const found = billingRecipientsFromLevel(level);
    if (found.length) { all = found; break; }
  }
  return { to: all[0] ?? null, cc: all.slice(1), all };
}
