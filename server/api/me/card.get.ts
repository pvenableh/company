// server/api/me/card.get.ts
/**
 * The current user's "My Card" — business card (cd_cards) + booking
 * (scheduler_settings) + the public share URLs. Seeds a card on first access.
 */
import { loadMyCard } from '~~/server/utils/my-card';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  try {
    return await loadMyCard(event, userId);
  } catch (error: any) {
    console.error('[me/card] load failed:', error?.message);
    throw createError({ statusCode: 500, message: 'Could not load your card' });
  }
});
