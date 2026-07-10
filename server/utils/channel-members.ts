/**
 * Shared helpers for the channels comms hub read-state / roster.
 *
 * Writes to `channel_members` go through the admin (server-token) client after
 * an org-membership check in application code — Directus 11 does not FK-walk on
 * `create` perms, so the collection has no row-level client permissions and all
 * access is proxied (same trust boundary as the messages route).
 */
import { readItem, readItems, createItem, updateItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

/**
 * Resolve a channel's organization and assert the caller is an active member.
 * Returns the acting userId + the channel's org id.
 */
export async function requireChannelAccess(event: any, channelId: string): Promise<{ userId: string; organization: string }> {
  if (!channelId) throw createError({ statusCode: 400, message: 'channel is required' });

  const directus = getTypedDirectus();
  const channel = await directus.request(
    readItem('channels', channelId, { fields: ['id', 'organization'] }),
  ).catch(() => null) as { id: string; organization: string | null } | null;

  if (!channel) throw createError({ statusCode: 404, message: 'Channel not found' });
  if (!channel.organization) throw createError({ statusCode: 422, message: 'Channel has no organization' });

  const { userId } = await requireOrgMembership(event, channel.organization);
  return { userId, organization: channel.organization };
}

/** Fetch the caller's membership row for a channel, or null. */
export async function findMembership(directus: any, channelId: string, userId: string) {
  const rows = await directus.request(
    readItems('channel_members', {
      filter: { _and: [{ channel: { _eq: channelId } }, { user: { _eq: userId } }] },
      fields: ['id', 'channel', 'user', 'organization', 'last_read_at', 'last_read_message', 'joined_at', 'muted'],
      limit: 1,
    }),
  ) as any[];
  return rows?.[0] ?? null;
}

/**
 * Upsert the caller's membership row. Creates it (auto-join) if absent.
 * `patch` is merged into an existing row or the newly created one.
 */
export async function upsertMembership(
  directus: any,
  channelId: string,
  userId: string,
  organization: string,
  patch: Record<string, any>,
  nowIso: string,
) {
  const existing = await findMembership(directus, channelId, userId);
  if (existing) {
    if (Object.keys(patch).length === 0) return existing;
    return await directus.request(updateItem('channel_members', existing.id, patch));
  }
  return await directus.request(
    createItem('channel_members', {
      channel: channelId,
      user: userId,
      organization,
      joined_at: nowIso,
      last_read_at: nowIso,
      muted: false,
      ...patch,
    }),
  );
}

/** Active org ids the caller belongs to. */
export async function getUserOrgIds(userId: string): Promise<string[]> {
  const directus = getTypedDirectus();
  const rows = await directus.request(
    readItems('org_memberships', {
      filter: { _and: [{ user: { _eq: userId } }, { status: { _eq: 'active' } }] },
      fields: ['organization'],
      limit: -1,
    }),
  ) as any[];
  return [...new Set(rows.map((r) => r.organization).filter(Boolean))];
}
