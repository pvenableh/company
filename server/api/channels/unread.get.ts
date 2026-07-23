/**
 * Per-channel unread counts for the current user, powering the message pane's
 * unread dividers and the AppRail badge.
 *
 * Unread = published messages authored by someone else, after the caller's read
 * cursor, in a channel they can access. Two sources:
 *   1. Channels with a `channel_members` row (opened before / seeded) — count
 *      after `last_read_at`. Muted rows report a count but skip `total`.
 *   2. Org-wide channels the caller can access but has NEVER opened (no row yet)
 *      — count after the caller's org-join date so a brand-new channel badges
 *      immediately instead of staying silent until first visit, without an old
 *      channel's entire backlog lighting up. (Restricted channels are always
 *      seeded with a row, so they never fall into this second bucket.)
 * See project_channels_apps_home Phase F.
 */
import { aggregate, readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  try {
  return await withTransientRetry(async () => {
  const directus = getTypedDirectus();

  // Active org memberships → org ids + per-org "floor" (join date) for the
  // never-opened count below.
  const memRows = await directus.request(
    readItems('org_memberships', {
      filter: { _and: [{ user: { _eq: userId } }, { status: { _eq: 'active' } }] },
      fields: ['organization', 'accepted_at', 'date_created'],
      limit: -1,
    }),
  ) as Array<{ organization: string; accepted_at: string | null; date_created: string | null }>;
  const orgIds = [...new Set(memRows.map((r) => r.organization).filter(Boolean))];
  if (!orgIds.length) return { channels: {}, total: 0 };
  const floorByOrg: Record<string, string | null> = {};
  for (const r of memRows) floorByOrg[r.organization] = r.accepted_at || r.date_created || null;

  const memberships = await directus.request(
    readItems('channel_members', {
      filter: {
        _and: [
          { user: { _eq: userId } },
          { organization: { _in: orgIds } },
        ],
      },
      fields: ['channel', 'last_read_at', 'muted', 'role'],
      limit: -1,
    }),
  ) as Array<{ channel: string; last_read_at: string | null; muted: boolean; role: string | null }>;

  // Audience gate: a restricted channel only counts toward unread if this row
  // still grants access (role non-null). A revoked member (role nulled) keeps
  // the row as a read cursor but must not see a badge for a channel they can no
  // longer open. Org-wide channels count regardless of role (org access covers
  // them). See project_channels_apps_home Phase F.
  const channelIds = memberships.map((m) => m.channel).filter(Boolean);
  const audienceById: Record<string, string> = {};
  if (channelIds.length) {
    const chRows = await directus.request(
      readItems('channels', { filter: { id: { _in: channelIds } }, fields: ['id', 'audience'], limit: -1 }),
    ) as Array<{ id: string; audience: string | null }>;
    for (const c of chRows) audienceById[c.id] = c.audience || 'organization';
  }
  const accessible = memberships.filter(
    (m) => audienceById[m.channel] !== 'restricted' || !!m.role,
  );

  // Per channel: { count, lastReadAt } — lastReadAt anchors the message pane's
  // "new messages" divider; count drives the roster + AppRail badges.
  const channels: Record<string, { count: number; lastReadAt: string | null }> = {};
  let total = 0;

  await Promise.all(
    accessible.map(async (m) => {
      if (!m.channel) return;
      const filter: any = {
        _and: [
          { channel: { _eq: m.channel } },
          { status: { _eq: 'published' } },
          { user_created: { _neq: userId } },
        ],
      };
      if (m.last_read_at) filter._and.push({ date_created: { _gt: m.last_read_at } });

      const res = await directus.request(
        aggregate('messages', { aggregate: { count: '*' }, query: { filter } }),
      ) as Array<{ count: string | number }>;

      const count = Number(res?.[0]?.count ?? 0) || 0;
      channels[m.channel] = { count, lastReadAt: m.last_read_at };
      if (!m.muted) total += count;
    }),
  );

  // Bucket 2 — never-opened org-wide channels (no cursor row yet). One grouped
  // aggregate per org (bounded: a user belongs to few orgs) counts messages by
  // others after that org's join floor. Channels with zero simply don't appear.
  const cursorIds = new Set(memberships.map((m) => m.channel).filter(Boolean));
  const orgWide = await directus.request(
    readItems('channels', {
      filter: {
        _and: [
          { audience: { _eq: 'organization' } },
          { organization: { _in: orgIds } },
          { status: { _in: ['published', 'draft'] } },
          ...(cursorIds.size ? [{ id: { _nin: [...cursorIds] } }] : []),
        ],
      },
      fields: ['id', 'organization'],
      limit: -1,
    }),
  ) as Array<{ id: string; organization: string }>;

  const idsByOrg = new Map<string, string[]>();
  for (const c of orgWide) {
    if (!c.id || !c.organization) continue;
    if (!idsByOrg.has(c.organization)) idsByOrg.set(c.organization, []);
    idsByOrg.get(c.organization)!.push(c.id);
  }

  await Promise.all(
    [...idsByOrg.entries()].map(async ([org, ids]) => {
      const floor = floorByOrg[org] || null;
      const filter: any = {
        _and: [
          { channel: { _in: ids } },
          { status: { _eq: 'published' } },
          { user_created: { _neq: userId } },
        ],
      };
      // Floor at the join date so backlog predating the user doesn't all badge.
      if (floor) filter._and.push({ date_created: { _gt: floor } });

      const grouped = await directus.request(
        aggregate('messages', { aggregate: { count: '*' }, groupBy: ['channel'], query: { filter, limit: -1 } }),
      ) as Array<{ channel: string; count: string | number }>;

      for (const row of grouped) {
        const count = Number(row?.count ?? 0) || 0;
        if (!row?.channel || !count) continue;
        channels[row.channel] = { count, lastReadAt: floor };
        total += count;
      }
    }),
  );

  return { channels, total };
  }, { label: 'channels/unread' });
  } catch (err: any) {
    // Unread badges are non-critical chrome — after retries, a Directus blip
    // during the post-login request burst must not surface as a hard 500. Log the
    // REAL error (so prod logs show the true cause) and report "nothing unread".
    console.error('[channels/unread] Failed, returning empty:', err?.message || err);
    return { channels: {}, total: 0 };
  }
});
