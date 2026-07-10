/**
 * Mark a channel read — advance the caller's read cursor to now (and optionally
 * anchor `last_read_message` for the "new messages" divider). Auto-joins:
 * reading a channel upserts a membership row if one doesn't exist yet.
 * See project_channels_apps_home.
 */
import { requireChannelAccess, upsertMembership } from '~~/server/utils/channel-members';

interface ReadBody { last_read_message?: string | null }

export default defineEventHandler(async (event) => {
  const channelId = getRouterParam(event, 'channel');
  const { userId, organization } = await requireChannelAccess(event, channelId!);

  const body = await readBody<ReadBody>(event).catch(() => ({} as ReadBody));
  const now = new Date().toISOString();

  const patch: Record<string, any> = { last_read_at: now };
  if (body?.last_read_message) patch.last_read_message = body.last_read_message;

  const directus = getTypedDirectus();
  const row = await upsertMembership(directus, channelId!, userId, organization, patch, now);
  return row;
});
