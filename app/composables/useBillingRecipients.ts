/**
 * useBillingRecipients — the ONE write path for a client's billing recipients.
 *
 * Source of truth = the client's contacts flagged `is_billing_contact`, ordered
 * by `sort` (index 0 = primary/To). Every surface that edits billing recipients
 * (the invoice detail editor, the client form) goes through `syncBillingRecipients`
 * so the stores can't drift again. Reads are handled by the shared pure resolver
 * `resolveBillingRecipients` (~~/shared/billing-recipients).
 *
 * What a save does:
 *   - flag + order the chosen contacts (by array position → `sort`)
 *   - create a lightweight contact for any chosen email that isn't a contact yet
 *   - un-flag contacts that were billing but are no longer chosen
 *   - mirror the primary into the legacy `billing_email`/`billing_name` scalars
 *     and clear the legacy `billing_contacts` JSON blob so it can never mask the
 *     contacts as the source of truth
 */
export interface BillingChoice {
  name: string;
  email: string;
}

export function useBillingRecipients() {
  const contactItems = useDirectusItems('contacts');
  const { createContact, updateContact } = useContacts();
  const { updateClient } = useClients();

  /** All of a client's contacts that have an email (billing-flagged first). */
  async function loadClientContacts(clientId: string): Promise<any[]> {
    const rows = (await contactItems.list({
      fields: ['id', 'first_name', 'last_name', 'email', 'is_billing_contact', 'sort'],
      filter: { client: { _eq: clientId } },
      limit: -1,
    }).catch(() => [])) as any[];
    return rows
      .filter((c) => String(c?.email || '').trim())
      .sort((a, b) => Number(!!b.is_billing_contact) - Number(!!a.is_billing_contact));
  }

  /** The client's current billing recipients, ordered by sort (index 0 = To). */
  function currentBillingChoices(contacts: any[]): BillingChoice[] {
    return contacts
      .filter((c) => c.is_billing_contact && String(c.email || '').trim())
      .slice()
      .sort((a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER))
      .map((c) => ({ name: `${c.first_name || ''} ${c.last_name || ''}`.trim(), email: String(c.email).trim() }));
  }

  /**
   * Persist `chosen` (ordered) as the client's billing recipients.
   * `existing` is the client's current contact list (from loadClientContacts).
   */
  async function syncBillingRecipients(clientId: string, chosen: BillingChoice[], existing: any[]): Promise<void> {
    const chosenEmails = new Set(chosen.map((r) => r.email.toLowerCase()));
    const byEmail = new Map(existing.map((c) => [String(c.email || '').toLowerCase(), c]));
    const ops: Promise<any>[] = [];

    chosen.forEach((r, idx) => {
      const ex = byEmail.get(r.email.toLowerCase());
      if (ex) {
        if (!ex.is_billing_contact || ex.sort !== idx) {
          ops.push(updateContact(ex.id, { is_billing_contact: true, sort: idx } as any));
        }
      } else {
        const parts = (r.name || '').trim().split(/\s+/).filter(Boolean);
        ops.push(createContact({
          first_name: parts[0] || null,
          last_name: parts.slice(1).join(' ') || null,
          email: r.email,
          client: clientId,
          is_billing_contact: true,
          sort: idx,
          source: 'billing-editor',
        } as any));
      }
    });

    for (const c of existing) {
      if (c.is_billing_contact && !chosenEmails.has(String(c.email || '').toLowerCase())) {
        ops.push(updateContact(c.id, { is_billing_contact: false } as any));
      }
    }

    await Promise.all(ops);

    await updateClient(clientId, {
      billing_email: chosen[0]?.email || null,
      billing_name: chosen[0]?.name || null,
      billing_contacts: [],
    } as any);
  }

  return { loadClientContacts, currentBillingChoices, syncBillingRecipients };
}
