/**
 * Save a marketing plan or analysis. Mirrors the plan into both
 * `ai_chat_sessions` (for the chat history surface) and `marketing_campaigns`
 * (for the marketing dashboard). The chat-session writes use the user
 * token; the marketing_campaigns write uses the server token because that
 * collection has no row-level perms granted to org roles yet.
 */
import { createItem } from '@directus/sdk';

interface SavePlanRequest {
  type: 'dashboard' | 'campaign';
  title: string;
  data: Record<string, any>;
  goal?: string;
  organizationId?: string;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SavePlanRequest>(event);
  if (!body.type || !body.data) {
    throw createError({ statusCode: 400, message: 'type and data are required' });
  }
  if (!body.organizationId) {
    throw createError({ statusCode: 400, message: 'organizationId is required' });
  }

  const { userId } = await requireOrgMembership(event, body.organizationId);

  const directus = await getUserDirectus(event);

  // Save as an AI chat session with the plan data stored in messages
  const chatSession = await directus.request(
    createItem('ai_chat_sessions', {
      user: userId,
      title: body.title || `Marketing ${body.type === 'dashboard' ? 'Analysis' : 'Campaign Plan'}`,
      status: 'active',
      context: { page: 'marketing', type: body.type },
    }),
  ) as any;

  // Save the user's goal/request as first message
  const userContent = body.type === 'campaign'
    ? `Generate a marketing campaign plan for: ${body.goal || 'general marketing'}`
    : 'Analyze marketing health and provide insights';

  await directus.request(
    createItem('ai_chat_messages', {
      session: chatSession.id,
      role: 'user',
      content: userContent,
      sort: 1,
    }),
  );

  // Save the AI response (the plan data) as second message
  await directus.request(
    createItem('ai_chat_messages', {
      session: chatSession.id,
      role: 'assistant',
      content: JSON.stringify(body.data, null, 2),
      metadata: { type: body.type, savedAt: new Date().toISOString() },
      sort: 2,
    }),
  );

  // marketing_campaigns row — server token, since user perms aren't wired.
  let campaignId = null;
  try {
    const adminDirectus = getTypedDirectus();
    const campaign = await adminDirectus.request(
      createItem('marketing_campaigns', {
        title: body.title || `Marketing ${body.type === 'dashboard' ? 'Analysis' : 'Campaign Plan'}`,
        goal: body.goal || null,
        status: 'draft',
        type: body.type,
        plan_data: body.data,
        organization: body.organizationId,
      }),
    ) as any;
    campaignId = campaign?.id;
  } catch (err) {
    console.warn('[save-plan] Could not save to marketing_campaigns:', (err as Error).message);
  }

  return {
    sessionId: chatSession.id,
    campaignId,
    message: `${body.type === 'dashboard' ? 'Analysis' : 'Campaign plan'} saved successfully`,
  };
});
