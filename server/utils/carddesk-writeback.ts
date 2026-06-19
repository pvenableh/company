// server/utils/carddesk-writeback.ts
/**
 * Bidirectional activity sync: Earnest CRM → Card Desk.
 *
 * When a relevant CRM event lands on an Earnest `contacts` row that was
 * sourced from a Card Desk card (i.e. some `cd_contacts.promoted_contact`
 * points at it), mirror it back into that card's `cd_activities` timeline so
 * the rolodex stays in sync with the CRM.
 *
 * Scope (confirmed with the product owner): logged calls, logged/sent emails,
 * meetings, notes, and pipeline stage changes. These are distinct from the
 * lifecycle types the promote flow writes ('promoted_to_earnest',
 * 'converted_client', 'converted_partner'), and the sync is strictly
 * one-directional (Earnest → Card Desk), so there is NO loop with the promote
 * writeback — nothing here is triggered by a cd_activities change.
 *
 * Both helpers are error-safe: a CardDesk writeback failure must never break
 * the real CRM flow that triggered it. They use the admin client because the
 * write happens behind the user's request and on a *different* user's rolodex
 * (the card's owner, who may not be the actor).
 */
import { createItem, readItems } from '@directus/sdk';

export type CardDeskActivityType = 'call' | 'email' | 'meeting' | 'note' | 'stage_change';

const DEFAULT_LABELS: Record<CardDeskActivityType, string> = {
  call: 'Call logged in Earnest',
  email: 'Email sent from Earnest',
  meeting: 'Meeting in Earnest',
  note: 'Note added in Earnest',
  stage_change: 'Pipeline stage changed in Earnest',
};

/**
 * Batch variant — one `cd_contacts` lookup for a whole set of Earnest contact
 * ids, then a fan-out of matching `cd_activities` rows. Use this from
 * high-volume call sites (e.g. a newsletter send touching many contacts) so we
 * don't run one query per contact.
 */
export async function writebackCardDeskActivityBatch(
  contactIds: Array<string | null | undefined>,
  type: CardDeskActivityType,
  opts?: { label?: string | null; note?: string | null; date?: string },
): Promise<void> {
  const ids = Array.from(
    new Set((contactIds || []).filter((id): id is string => !!id && typeof id === 'string')),
  );
  if (ids.length === 0) return;

  try {
    const directus = getTypedDirectus();

    // Every Card Desk card pointing at one of these contacts. There can be
    // more than one (different users each promoted the same person from their
    // own rolodex); each gets its own mirrored activity.
    const cards = (await directus.request(
      readItems('cd_contacts', {
        fields: ['id', 'user_created', 'promoted_contact'],
        filter: { promoted_contact: { _in: ids } },
        limit: -1,
      }),
    )) as Array<{ id: string; user_created: string | null; promoted_contact: string | null }>;

    if (!cards.length) return;

    const date = opts?.date || new Date().toISOString();
    const label = opts?.label || DEFAULT_LABELS[type];

    await Promise.all(
      cards.map((card) =>
        directus
          .request(
            createItem('cd_activities', {
              contact: card.id,
              type,
              label,
              note: opts?.note || null,
              date,
              // Attribute the mirrored row to the card's owner so it stays
              // inside their user-scoped rolodex view.
              user_created: card.user_created || undefined,
            }),
          )
          .catch((err: any) =>
            console.warn(`[carddesk-writeback] create for card ${card.id} failed:`, err?.message),
          ),
      ),
    );
  } catch (err: any) {
    console.warn('[carddesk-writeback] batch lookup failed:', err?.message);
  }
}

/**
 * Single-contact convenience wrapper around the batch variant.
 */
export async function writebackCardDeskActivity(input: {
  contactId: string | null | undefined;
  type: CardDeskActivityType;
  label?: string | null;
  note?: string | null;
  date?: string;
}): Promise<void> {
  if (!input.contactId) return;
  await writebackCardDeskActivityBatch([input.contactId], input.type, {
    label: input.label,
    note: input.note,
    date: input.date,
  });
}
