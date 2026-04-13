/**
 * Manually trigger a context broker rebuild for an organization.
 *
 * Body: { organizationId: string }
 * Auth: user session OR cronSecret Bearer token
 *
 * Returns: { success: true, tokenEstimate, builtAt }
 */

import { rebuildOrgContext } from '~~/server/utils/context-broker';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { organizationId } = body;

  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  // Auth: accept user session or cronSecret
  const authHeader = getHeader(event, 'authorization');
  const config = useRuntimeConfig();
  const cronSecret = config.cronSecret || config.public?.cronSecret;

  if (authHeader === `Bearer ${cronSecret}` && cronSecret) {
    // Authenticated via cron secret — proceed
  } else {
    // Fall back to user session auth
    const session = await requireUserSession(event);
    const userId = (session as any).user?.id;
    if (!userId) {
      throw createError({ statusCode: 401, message: 'Authentication required' });
    }
  }

  try {
    const context = await rebuildOrgContext(organizationId);
    return {
      success: true,
      tokenEstimate: context.tokenEstimate,
      builtAt: context.builtAt,
    };
  } catch (error: any) {
    console.error('[ai/context/refresh] Rebuild failed:', error);
    throw createError({
      statusCode: 500,
      message: error.message || 'Context rebuild failed',
    });
  }
});
