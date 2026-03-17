/**
 * Save a marketing plan or analysis to AI chat sessions for later reference.
 */
import { createItem } from '@directus/sdk';

interface SavePlanRequest {
  type: 'dashboard' | 'campaign';
  title: string;
  data: Record<string, any>;
  goal?: string;
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody<SavePlanRequest>(event);
  if (!body.type || !body.data) {
    throw createError({ statusCode: 400, message: 'type and data are required' });
  }

  const directus = await getUserDirectus(event);

  // Save as an AI chat session with the plan data stored in messages
  const chatSession = await directus.request(
    createItem('ai_chat_sessions', {
      title: body.title || `Marketing ${body.type === 'dashboard' ? 'Analysis' : 'Campaign Plan'}`,
      status: 'active',
      context: 'marketing',
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

  return {
    sessionId: chatSession.id,
    message: `${body.type === 'dashboard' ? 'Analysis' : 'Campaign plan'} saved successfully`,
  };
});
