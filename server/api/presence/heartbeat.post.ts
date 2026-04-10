// server/api/presence/heartbeat.post.ts
/**
 * User presence heartbeat endpoint.
 * Records the current user's last-seen timestamp in an in-memory store.
 * Called every ~30s by the client-side usePresence composable.
 */

import { _presenceStore } from '~~/server/utils/presenceStore';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  _presenceStore.set(userId, Date.now());

  return { ok: true };
});
