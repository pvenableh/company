// server/api/ai/chat.post.ts
/**
 * AI Chat endpoint — Streams LLM responses via Server-Sent Events (SSE).
 *
 * Request body:
 * {
 *   sessionId?: string,  // Existing session to continue (creates new if omitted)
 *   message: string,     // User's message
 *   model?: string,      // LLM model override
 * }
 *
 * Response: SSE stream with chunks of the assistant's response.
 * Final event includes the full response and session metadata.
 */

import { createItem, readItems, readItem, updateItem } from '@directus/sdk';
import { getLLMProvider } from '~/server/utils/llm/factory';
import { buildSystemPrompt } from '~/server/utils/llm/context';
import type { ChatMessage } from '~/server/utils/llm/types';

export default defineEventHandler(async (event) => {
  // Require authentication
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const { sessionId, message, model } = body;

  if (!message?.trim()) {
    throw createError({ statusCode: 400, message: 'Message is required' });
  }

  const directus = await getUserDirectus(event);

  try {
    // 1. Get or create session
    let chatSessionId = sessionId;
    if (!chatSessionId) {
      // Create new session
      const newSession = await directus.request(
        createItem('ai_chat_sessions', {
          user: userId,
          title: message.trim().substring(0, 100),
          status: 'active',
        }),
      );
      chatSessionId = (newSession as any).id;
    }

    // 2. Store user message
    await directus.request(
      createItem('ai_chat_messages', {
        session: chatSessionId,
        role: 'user',
        content: message.trim(),
      }),
    );

    // 3. Load conversation history
    const previousMessages = await directus.request(
      readItems('ai_chat_messages', {
        filter: { session: { _eq: chatSessionId } },
        fields: ['role', 'content'],
        sort: ['date_created'],
        limit: 50, // Keep last 50 messages for context
      }),
    ) as Array<{ role: string; content: string }>;

    // 4. Build messages array for LLM
    const chatMessages: ChatMessage[] = previousMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // 5. Get org context for system prompt
    let orgContext: any = {};
    try {
      // Try to get the user's org info from session
      const userData = (session as any).user;
      orgContext = {
        userName: userData?.first_name
          ? `${userData.first_name} ${userData.last_name || ''}`.trim()
          : undefined,
      };
    } catch {
      // Continue without org context
    }

    const systemPrompt = buildSystemPrompt(orgContext);

    // 6. Stream response via SSE
    const provider = getLLMProvider();

    // Set SSE headers
    setResponseHeaders(event, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const responseWriter = event.node.res;
    let fullResponse = '';

    try {
      const stream = provider.chatStream(chatMessages, {
        model,
        systemPrompt,
        maxTokens: 4096,
      });

      for await (const chunk of stream) {
        fullResponse += chunk;
        // Send SSE data event
        responseWriter.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      }

      // 7. Store assistant response
      await directus.request(
        createItem('ai_chat_messages', {
          session: chatSessionId,
          role: 'assistant',
          content: fullResponse,
        }),
      );

      // Update session title if this is the first exchange
      if (!sessionId) {
        // Auto-generate a title from the first message
        const title = message.trim().substring(0, 100);
        await directus.request(
          updateItem('ai_chat_sessions', chatSessionId, { title }),
        ).catch(() => {});
      }

      // Send final event with metadata
      responseWriter.write(
        `data: ${JSON.stringify({
          type: 'done',
          sessionId: chatSessionId,
          content: fullResponse,
        })}\n\n`,
      );
    } catch (streamError: any) {
      responseWriter.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: streamError.message || 'Stream failed',
        })}\n\n`,
      );
    }

    responseWriter.end();
  } catch (error: any) {
    console.error('[ai/chat] Error:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'AI chat failed',
    });
  }
});
