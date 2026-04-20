// server/api/ai/notices.get.ts
/**
 * Generate proactive AI notices for a specific entity.
 * Pure data analysis — no LLM calls. Fast and cheap.
 *
 * Query params:
 *   entityType:     'client' | 'project' | 'invoice' (required)
 *   entityId:       string (required)
 *   organizationId: string (required)
 *
 * Returns: { notices: AINotice[] }
 */

import {
  generateClientNotices,
  generateProjectNotices,
  generateInvoiceNotices,
  generateLeadNotices,
  generateProposalNotices,
  generateContactNotices,
  generateTicketNotices,
  generateTeamNotices,
  PRIORITY_ORDER,
} from '~~/server/utils/ai-notices';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const query = getQuery(event);
  const entityType = query.entityType as string;
  const entityId = query.entityId as string;
  const organizationId = query.organizationId as string;

  if (!entityType || !entityId || !organizationId) {
    throw createError({ statusCode: 400, message: 'entityType, entityId, and organizationId are required' });
  }

  const directus = await getUserDirectus(event);
  const now = new Date();

  try {
    let notices: any[] = [];

    if (entityType === 'client') {
      notices = await generateClientNotices(directus, entityId, organizationId, now);
    } else if (entityType === 'project') {
      notices = await generateProjectNotices(directus, entityId, organizationId, now);
    } else if (entityType === 'invoice') {
      notices = await generateInvoiceNotices(directus, entityId, organizationId, now);
    } else if (entityType === 'lead') {
      notices = await generateLeadNotices(directus, entityId, organizationId, now);
    } else if (entityType === 'proposal') {
      notices = await generateProposalNotices(directus, entityId, organizationId, now);
    } else if (entityType === 'contact') {
      notices = await generateContactNotices(directus, entityId, organizationId, now);
    } else if (entityType === 'ticket') {
      notices = await generateTicketNotices(directus, entityId, organizationId, now);
    } else if (entityType === 'team') {
      notices = await generateTeamNotices(directus, entityId, organizationId, now);
    }

    // Sort by priority (urgent first)
    notices.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    return { notices };
  } catch (error: any) {
    console.error('[ai/notices] Error:', error);
    return { notices: [] }; // Graceful degradation — never block the page
  }
});
