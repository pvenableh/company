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

const stripHtml = (html: string) => (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);

/**
 * Append a Phase F moderation-audit row (hide/remove/report). Best-effort —
 * never throws into the caller (auditing must not block the action).
 */
export async function logModerationEvent(
  directus: any,
  ev: {
    channel: string;
    organization: string | null;
    moderator: string | null;
    action: 'hide' | 'remove' | 'report';
    reason?: string | null;
    message_id?: string | null;
    message_author?: string | null;
    message_snippet?: string | null;
  },
): Promise<void> {
  try {
    await directus.request(
      createItem('channel_moderation_log', {
        channel: ev.channel,
        organization: ev.organization,
        moderator: ev.moderator,
        action: ev.action,
        reason: ev.reason ?? null,
        message_id: ev.message_id ?? null,
        message_author: ev.message_author ?? null,
        message_snippet: ev.message_snippet ? stripHtml(ev.message_snippet) : null,
      }),
    );
  } catch (e) {
    console.warn('[moderation-log] failed to record event:', e);
  }
}

/**
 * Resolve the user ids implied by a Team or Client "audience shortcut", scoped
 * to `organization` (a restricted channel must not admit outsiders). Returns a
 * deduped id list. Team → its junction members; Client → its active client-role
 * org_memberships. Phase F fast-follow.
 */
export async function resolveAudienceMembers(
  directus: any,
  organization: string,
  opts: { team?: string | null; client?: string | null },
): Promise<string[]> {
  const ids = new Set<string>();

  if (opts.team) {
    const rows = await directus.request(
      readItems('junction_directus_users_teams', {
        filter: { teams_id: { _eq: opts.team } },
        fields: ['directus_users_id'],
        limit: -1,
      }),
    ) as Array<{ directus_users_id: any }>;
    for (const r of rows) {
      const uid = typeof r.directus_users_id === 'object' ? r.directus_users_id?.id : r.directus_users_id;
      if (uid) ids.add(uid);
    }
  }

  if (opts.client) {
    // Client login users live in `client_portal_users` (the portal-user split),
    // not `org_memberships`. Read both so restricting a channel to a client
    // actually resolves that client's people. Legacy client-role org_memberships
    // (if any remain) are still honoured.
    const [orgRows, portalRows] = await Promise.all([
      directus.request(
        readItems('org_memberships', {
          filter: { _and: [
            { organization: { _eq: organization } },
            { client: { _eq: opts.client } },
            { status: { _eq: 'active' } },
          ] },
          fields: ['user'],
          limit: -1,
        }),
      ) as Promise<Array<{ user: any }>>,
      directus.request(
        readItems('client_portal_users', {
          filter: { _and: [
            { organization: { _eq: organization } },
            { client: { _eq: opts.client } },
            { status: { _eq: 'active' } },
          ] },
          fields: ['user'],
          limit: -1,
        }),
      ) as Promise<Array<{ user: any }>>,
    ]);
    for (const r of [...orgRows, ...portalRows]) {
      const uid = typeof r.user === 'object' ? r.user?.id : r.user;
      if (uid) ids.add(uid);
    }
  }

  // Keep only users who actually belong to the org.
  const out: string[] = [];
  for (const uid of ids) {
    const orgIds = await getUserOrgIds(uid);
    if (orgIds.includes(organization)) out.push(uid);
  }
  return out;
}

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
      fields: ['id', 'channel', 'user', 'organization', 'last_read_at', 'last_read_message', 'joined_at', 'muted', 'role'],
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

/**
 * The caller's active org-role slug in `orgId` ('owner'|'admin'|'manager'|
 * 'member'|'client'), or null if not an active member.
 */
export async function getOrgRoleSlug(directus: any, userId: string, orgId: string): Promise<string | null> {
  const rows = await directus.request(
    readItems('org_memberships', {
      filter: { _and: [{ user: { _eq: userId } }, { organization: { _eq: orgId } }, { status: { _eq: 'active' } }] },
      fields: ['role.slug'],
      limit: 1,
    }),
  ) as Array<{ role?: { slug?: string } | null }>;
  return rows?.[0]?.role?.slug ?? null;
}

/**
 * Assert the caller may MANAGE a channel — its audience, membership roster, and
 * message moderation. Allowed for: an org owner/admin of the channel's org, the
 * channel's creator (`user_created`), or a channel moderator (a channel_members
 * row with role='moderator'). Returns the acting user + the resolved channel.
 * Mirrors the app-side gate; enforced here because moderation runs on the admin
 * token (channel_members has no row-level client perms).
 */
export async function requireChannelManager(
  event: any,
  channelId: string,
): Promise<{ userId: string; organization: string; channel: any }> {
  const { userId, organization } = await requireChannelAccess(event, channelId);
  const directus = getTypedDirectus();

  const channel = await directus.request(
    readItem('channels', channelId, { fields: ['id', 'organization', 'audience', 'user_created', 'name'] }),
  ) as any;

  const creatorId = typeof channel?.user_created === 'object' ? channel.user_created?.id : channel?.user_created;
  if (creatorId && creatorId === userId) return { userId, organization, channel };

  const slug = await getOrgRoleSlug(directus, userId, organization);
  if (slug === 'owner' || slug === 'admin') return { userId, organization, channel };

  const membership = await findMembership(directus, channelId, userId);
  if (membership?.role === 'moderator') return { userId, organization, channel };

  throw createError({ statusCode: 403, message: 'You do not manage this channel' });
}

/**
 * Active org ids the caller belongs to — via a team `org_memberships` row OR a
 * `client_portal_users` row (client login users have no org_membership). Both
 * are checked so a portal user can legitimately be added to a channel in their
 * own org.
 */
export async function getUserOrgIds(userId: string): Promise<string[]> {
  const directus = getTypedDirectus();
  const [rows, portalRows] = await Promise.all([
    directus.request(
      readItems('org_memberships', {
        filter: { _and: [{ user: { _eq: userId } }, { status: { _eq: 'active' } }] },
        fields: ['organization'],
        limit: -1,
      }),
    ) as Promise<any[]>,
    directus.request(
      readItems('client_portal_users', {
        filter: { _and: [{ user: { _eq: userId } }, { status: { _eq: 'active' } }] },
        fields: ['organization'],
        limit: -1,
      }),
    ) as Promise<any[]>,
  ]);
  const orgOf = (r: any) => (typeof r.organization === 'object' ? r.organization?.id : r.organization);
  return [...new Set([...rows, ...portalRows].map(orgOf).filter(Boolean))];
}
