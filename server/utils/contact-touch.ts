// server/utils/contact-touch.ts
/**
 * Maintain `contacts.last_contacted_at` + `last_contacted_channel`.
 *
 * Pass an array of email addresses (and the channel that produced the touch)
 * after a real contact moment lands — outbound email send, new meeting
 * attendee, etc. The helper resolves each email to the matching contact
 * row(s) in the given org and bumps the timestamp + channel.
 *
 * Safe to call from any server route. Catches its own errors (we never want
 * to fail a real flow because the analytics column failed to update).
 *
 * Use the admin client (`getTypedDirectus()`) — these writes happen behind
 * the user's request and the user's policy may not grant `contacts.update`.
 */
import { readItems, updateItem } from '@directus/sdk';

type Channel = 'email' | 'meeting' | 'message' | 'task' | 'manual';

export async function touchContacts(
  emails: Array<string | null | undefined>,
  channel: Channel,
  organizationId?: string | null,
): Promise<void> {
  const cleaned = Array.from(
    new Set(
      (emails || [])
        .filter((e): e is string => !!e && typeof e === 'string')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0),
    ),
  );
  if (cleaned.length === 0) return;

  try {
    const directus = getTypedDirectus();

    // Match by email. Constrain by org — only contacts linked to the right
    // tenant get touched. The org junction is `contacts_organizations`, so we
    // walk via `organizations.organizations_id`. Callers MUST pass an
    // organizationId; without one, identical emails across tenants would all
    // be bumped from a single send. The omitted-org path is logged so we
    // notice if anything legacy still slips through.
    if (!organizationId) {
      console.warn('[contact-touch] called without organizationId — skipping to avoid cross-tenant bump');
      return;
    }
    const filter: any = {
      _and: [
        { email: { _in: cleaned } },
        { organizations: { organizations_id: { _eq: organizationId } } },
      ],
    };

    const rows = (await directus.request(
      readItems('contacts', {
        filter,
        fields: ['id', 'email'],
        limit: -1,
      }),
    )) as Array<{ id: string; email: string }>;

    if (!rows.length) return;

    const stamp = new Date().toISOString();
    await Promise.all(
      rows.map((r) =>
        directus.request(
          updateItem('contacts' as any, r.id as any, {
            last_contacted_at: stamp,
            last_contacted_channel: channel,
          } as any),
        ).catch((err: any) => {
          console.warn(`[contact-touch] update ${r.id} failed:`, err.message);
        }),
      ),
    );
  } catch (err: any) {
    console.warn('[contact-touch] lookup failed:', err.message);
  }
}
