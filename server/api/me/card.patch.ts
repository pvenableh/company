// server/api/me/card.patch.ts
/**
 * Update the current user's business card + booking. Body:
 *   { card?: { ...cd_cards writable fields }, booking?: { ...scheduler_settings } }
 * Field-allowlisted in saveMyCard (never writes user/id/timestamps). Returns the
 * fresh payload so the optimistic client can reconcile.
 */
import { loadMyCard, saveMyCard } from '~~/server/utils/my-card';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const body = await readBody(event).catch(() => ({})) as { card?: Record<string, any>; booking?: Record<string, any> };

  try {
    await saveMyCard(userId, { card: body?.card, booking: body?.booking });
    return await loadMyCard(event, userId);
  } catch (error: any) {
    console.error('[me/card] save failed:', error?.message);
    throw createError({ statusCode: 500, message: 'Could not save your card' });
  }
});
