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
  const { sessionId, message, model, clientId, organizationId, responseStyle } = body;

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

    // 5. Get org context + task context for system prompt
    let orgContext: any = {};
    try {
      const userData = (session as any).user;
      orgContext = {
        userName: userData?.first_name
          ? `${userData.first_name} ${userData.last_name || ''}`.trim()
          : undefined,
      };
    } catch {
      // Continue without org context
    }

    // Fetch user's tasks so the AI has awareness of their workload
    let taskContext = '';
    try {
      const tasks = await directus.request(
        readItems('project_tasks', {
          filter: { assignee_id: { _eq: userId } },
          fields: ['id', 'title', 'status', 'completed', 'due_date', 'priority'],
          sort: ['-due_date'],
          limit: 30,
        }),
      ) as Array<{ id: string; title: string; status: string; completed: boolean; due_date: string; priority: string }>;

      if (tasks.length > 0) {
        const pending = tasks.filter(t => !t.completed);
        const overdue = pending.filter(t => t.due_date && new Date(t.due_date) < new Date());
        const completed = tasks.filter(t => t.completed);

        taskContext = `\n\nUSER'S CURRENT TASKS (${tasks.length} total, ${pending.length} pending, ${completed.length} completed${overdue.length ? `, ${overdue.length} overdue` : ''}):\n`;
        taskContext += pending.slice(0, 15).map(t =>
          `- [${t.completed ? 'x' : ' '}] ${t.title}${t.due_date ? ` (due: ${t.due_date})` : ''}${t.priority ? ` [${t.priority}]` : ''}${t.status ? ` — ${t.status}` : ''}`,
        ).join('\n');
        if (overdue.length > 0) {
          taskContext += `\n\nOVERDUE TASKS:\n`;
          taskContext += overdue.map(t => `- ${t.title} (was due: ${t.due_date})`).join('\n');
        }
      }
    } catch {
      // Tasks collection may not be accessible — continue without
    }

    // 5b. Fetch brand context for the selected client or organization
    let brandContext = '';
    try {
      if (clientId) {
        const client = await directus.request(
          readItem('clients', clientId, {
            fields: ['name', 'brand_direction', 'goals', 'target_audience', 'location'],
          }),
        ) as any;
        if (client) {
          const parts: string[] = [`\n\nSELECTED CLIENT: ${client.name}`];
          if (client.brand_direction) parts.push(`Brand Direction: ${client.brand_direction}`);
          if (client.goals) parts.push(`Goals: ${client.goals}`);
          if (client.target_audience) parts.push(`Target Audience: ${client.target_audience}`);
          if (client.location) parts.push(`Location: ${client.location}`);
          brandContext = parts.join('\n');
        }
      } else if (organizationId) {
        const org = await directus.request(
          readItem('organizations', organizationId, {
            fields: ['name', 'brand_direction', 'goals', 'target_audience', 'location'],
          }),
        ) as any;
        if (org) {
          const parts: string[] = [`\n\nORGANIZATION CONTEXT: ${org.name}`];
          if (org.brand_direction) parts.push(`Brand Direction: ${org.brand_direction}`);
          if (org.goals) parts.push(`Goals: ${org.goals}`);
          if (org.target_audience) parts.push(`Target Audience: ${org.target_audience}`);
          if (org.location) parts.push(`Location: ${org.location}`);
          brandContext = parts.join('\n');
        }
      }
    } catch {
      // Brand context is non-critical — continue without
    }

    // Build response style instruction
    let styleContext = '';
    if (responseStyle === 'director') {
      styleContext = `\n\nRESPONSE STYLE: Director — You are a clear, decisive leader.
- Give step-by-step instructions and numbered priorities
- Cut the fluff — focus on what needs to happen NOW
- Use a confident, decisive tone
- When asked for help, identify the single most important next action
- Break complex problems into concrete, manageable steps
- End with a clear action item or decision point`;
    } else if (responseStyle === 'buddy') {
      styleContext = `\n\nRESPONSE STYLE: Buddy — You are a supportive coworker and friend.
- Be casual, warm, and genuine — like grabbing coffee together
- Use humor and light jokes where natural
- Share relatable observations ("I get it, Mondays are rough")
- Be honest but kind — don't sugarcoat, but deliver feedback gently
- Keep things relaxed while still being genuinely helpful
- Use emojis occasionally for warmth`;
    } else if (responseStyle === 'motivator') {
      styleContext = `\n\nRESPONSE STYLE: Motivator — You are an inspiring coach who believes deeply in this person's potential.
- Be uplifting, energizing, and genuinely encouraging
- Celebrate wins — even small ones ("You showed up today, that matters!")
- Reframe challenges as growth opportunities
- When someone is stuck or unmotivated, acknowledge the feeling first, then help them see their strengths
- Use powerful, vivid language that sparks action
- Reference their actual accomplishments (tasks completed, projects managed, etc.) as proof of capability
- End with a rallying call to action that feels authentic, not cheesy
- If they share frustration or struggle, validate it before redirecting to possibility`;
    }

    const systemPrompt = buildSystemPrompt(orgContext) + taskContext + brandContext + styleContext;

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
