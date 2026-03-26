// server/api/ai/preferences.post.ts
// Upsert AI preferences for the current user.
// Uses the server token so Directus permissions don't block saves.

import { createDirectus, rest, staticToken, readItems, createItem, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, message: 'Not authenticated' });
  }

  const body = await readBody(event);
  const userId = session.user.id;

  const config = useRuntimeConfig();
  const directus = createDirectus(config.public.directusUrl)
    .with(rest())
    .with(staticToken(config.directusServerToken || config.directusStaticToken));

  try {
    // Check for existing record
    const existing = await directus.request(
      readItems('ai_preferences', {
        filter: { user: { _eq: userId } },
        fields: ['id'],
        limit: 1,
      }),
    );

    // Build the payload — only include fields that were actually sent
    const payload: Record<string, any> = {};
    if (body.persona !== undefined) payload.persona = body.persona;
    if (body.enabled_modules !== undefined) payload.enabled_modules = body.enabled_modules;
    if (body.personalizations_enabled !== undefined) payload.personalizations_enabled = body.personalizations_enabled;
    if (body.low_usage_mode !== undefined) payload.low_usage_mode = body.low_usage_mode;
    if (body.token_budget_monthly !== undefined) payload.token_budget_monthly = body.token_budget_monthly;
    if (body.ai_enabled !== undefined) payload.ai_enabled = body.ai_enabled;
    if (body.organization !== undefined) payload.organization = body.organization;

    let record: any;

    if (existing.length > 0) {
      // Update existing
      record = await directus.request(
        updateItem('ai_preferences', existing[0].id, payload),
      );
    } else {
      // Create new
      record = await directus.request(
        createItem('ai_preferences', {
          user: userId,
          ai_enabled: true,
          ...payload,
        }),
      );
    }

    return { success: true, data: record };
  } catch (err: any) {
    console.error('[ai/preferences] Error upserting:', err);
    throw createError({
      statusCode: 500,
      message: err.message || 'Failed to save preferences',
    });
  }
});
