// server/api/ai/preferences.get.ts
// Read AI preferences for the current user.
// Uses the server token so Directus permissions don't block reads.

import { createDirectus, rest, staticToken, readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: 'Not authenticated' });
  }

  const userId = session.user.id;
  const config = useRuntimeConfig();
  const directus = createDirectus(config.public.directusUrl)
    .with(rest())
    .with(staticToken(config.directusServerToken));

  try {
    const records = await directus.request(
      readItems('ai_preferences', {
        filter: { user: { _eq: userId } },
        fields: ['id', 'persona', 'enabled_modules', 'personalizations_enabled', 'low_usage_mode', 'token_budget_monthly', 'ai_enabled', 'organization'],
        limit: 1,
      }),
    );

    return { success: true, data: records[0] || null };
  } catch (err: any) {
    console.error('[ai/preferences] Error reading:', err);
    throw createError({
      statusCode: 500,
      message: err.message || 'Failed to read preferences',
    });
  }
});
