// server/utils/my-card.ts
/**
 * "My Card" — the current user's digital business card (cd_cards) + booking
 * (scheduler_settings), read/written from Earnest. CardDesk and Earnest share one
 * Directus, so this edits the SAME rows CardDesk's /account and public /c/[id]
 * card read — one edit, live everywhere. Mirrors CardDesk's seed-on-first-access
 * (server/utils/cards.ts) so a card created here matches one created there.
 *
 * Admin-client reads/writes (getServerDirectus); the caller is the acting user
 * (requireUserSession) and every op is scoped to their own userId.
 */
import { readItems, readUsers, createItem, updateItem } from '@directus/sdk';

// Mirror CardDesk CARD_FIELDS (its socials + layout columns included).
export const CARD_FIELDS = [
  'id', 'user', 'display_name', 'title', 'company', 'email', 'phone', 'website',
  'linkedin', 'instagram', 'twitter', 'youtube', 'behance', 'headline',
  'office_address', 'show_address', 'flat_layout', 'image', 'cover_image',
  'logo_image', 'broadcast_activity', 'card_theme',
];

// Only these are writable from the My Card editor (never `user`/`id`/timestamps).
export const CARD_WRITABLE = new Set([
  'display_name', 'title', 'company', 'email', 'phone', 'website',
  'linkedin', 'instagram', 'twitter', 'youtube', 'behance', 'headline',
  'office_address', 'show_address', 'flat_layout', 'card_theme',
]);
export const BOOKING_WRITABLE = new Set([
  'public_booking_enabled', 'booking_page_slug', 'booking_page_title', 'booking_page_description',
]);

const ri = readItems as any;

/** One cd_cards row per user, seeded from the user's profile + primary org. */
export async function getOrCreateUserCard(directus: any, userId: string): Promise<any> {
  const rows = (await directus.request(
    ri('cd_cards', { filter: { user: { _eq: userId } }, fields: CARD_FIELDS, limit: 1 }),
  )) as any[];
  if (rows?.length) return rows[0];

  const users = (await directus.request(
    readUsers({
      filter: { id: { _eq: userId } } as any,
      fields: ['first_name', 'last_name', 'title', 'email', { organizations: [{ organizations_id: ['name'] }] }] as any,
      limit: 1,
    }),
  )) as any[];
  const u = users?.[0] ?? {};
  return await directus.request(
    (createItem as any)('cd_cards', {
      user: userId,
      display_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
      title: u.title ?? null,
      company: u.organizations?.[0]?.organizations_id?.name ?? null,
      email: u.email ?? null,
      broadcast_activity: true,
    }),
  );
}

/** The user's scheduler_settings row (or null). */
async function getSchedulerSettings(directus: any, userId: string): Promise<any | null> {
  const rows = (await directus.request(
    ri('scheduler_settings', {
      filter: { user_id: { _eq: userId } },
      fields: ['id', 'public_booking_enabled', 'booking_page_slug', 'booking_page_title', 'booking_page_description'],
      limit: 1,
    }),
  ).catch(() => [])) as any[];
  return rows?.[0] ?? null;
}

/** The user's primary org slug (booking URL org segment). */
async function getOrgSlug(directus: any, userId: string): Promise<string | null> {
  const orgs = (await directus.request(
    ri('organizations', {
      fields: ['slug'],
      filter: { users: { directus_users_id: { _eq: userId } } },
      limit: 1,
    }),
  ).catch(() => [])) as any[];
  return orgs?.[0]?.slug ?? null;
}

export interface MyCardPayload {
  card: any;
  booking: { public_booking_enabled: boolean; booking_page_slug: string | null; booking_page_title: string | null; booking_page_description: string | null };
  publicCardUrl: string;
  bookingPath: string | null;
  assetsUrl: string;
}

export async function loadMyCard(event: any, userId: string): Promise<MyCardPayload> {
  const directus = getServerDirectus();
  const config = useRuntimeConfig(event);
  const [card, settings, orgSlug] = await Promise.all([
    getOrCreateUserCard(directus, userId),
    getSchedulerSettings(directus, userId),
    getOrgSlug(directus, userId),
  ]);
  const cardDeskUrl = String((config.public as any)?.cardDeskUrl || 'https://carddesk.earnest.guru').replace(/\/$/, '');
  const userSlug = settings?.booking_page_slug || userId;
  return {
    card,
    booking: {
      public_booking_enabled: !!settings?.public_booking_enabled,
      booking_page_slug: settings?.booking_page_slug ?? null,
      booking_page_title: settings?.booking_page_title ?? null,
      booking_page_description: settings?.booking_page_description ?? null,
    },
    publicCardUrl: `${cardDeskUrl}/c/${userId}`,
    // Booking link only resolves when the user's org has a slug.
    bookingPath: orgSlug ? `/book/${orgSlug}/${userSlug}` : null,
    assetsUrl: String((config.public as any)?.assetsUrl || (config.public as any)?.directusUrl || '').replace(/\/$/, ''),
  };
}

export async function saveMyCard(
  userId: string,
  body: { card?: Record<string, any>; booking?: Record<string, any> },
): Promise<void> {
  const directus = getServerDirectus();

  if (body.card && Object.keys(body.card).length) {
    const card = await getOrCreateUserCard(directus, userId);
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(body.card)) if (CARD_WRITABLE.has(k)) patch[k] = v;
    if (Object.keys(patch).length) {
      await directus.request((updateItem as any)('cd_cards', card.id, patch));
    }
  }

  if (body.booking && Object.keys(body.booking).length) {
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(body.booking)) if (BOOKING_WRITABLE.has(k)) patch[k] = v;
    if (Object.keys(patch).length) {
      const existing = await getSchedulerSettings(directus, userId);
      if (existing) {
        await directus.request((updateItem as any)('scheduler_settings', existing.id, patch));
      } else {
        await directus.request((createItem as any)('scheduler_settings', { user_id: userId, ...patch }));
      }
    }
  }
}
