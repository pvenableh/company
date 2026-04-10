// server/api/presence/online.get.ts
/**
 * Returns the list of online users (seen within the last 90 seconds).
 * Used by the client-side usePresence composable to display green dots.
 */

import { _presenceStore, PRESENCE_TTL } from '~~/server/utils/presenceStore';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const now = Date.now();
  const onlineUsers: Array<{ userId: string; lastSeen: number }> = [];

  for (const [uid, lastSeen] of _presenceStore.entries()) {
    if (now - lastSeen < PRESENCE_TTL) {
      onlineUsers.push({ userId: uid, lastSeen });
    } else {
      // Clean up expired entries
      _presenceStore.delete(uid);
    }
  }

  return onlineUsers;
});
