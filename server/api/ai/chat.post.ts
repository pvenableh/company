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

import { createItem, readItems, updateItem } from '@directus/sdk';
import { getLLMProvider } from '~/server/utils/llm/factory';
import { buildSystemPrompt } from '~/server/utils/llm/context';
import { logAIUsage } from '~/server/utils/ai-usage';
import { enforceTokenLimits, deductOrgTokens } from '~/server/utils/ai-token-enforcement';
import { getBrandContext } from '~/server/utils/brand-context';
import type { ChatMessage } from '~/server/utils/llm/types';

export default defineEventHandler(async (event) => {
  // Require authentication
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const { sessionId, message, model, clientId, organizationId, responseStyle, verbosity } = body;

  if (!message?.trim()) {
    throw createError({ statusCode: 400, message: 'Message is required' });
  }

  // Enforce AI token limits before proceeding
  const tokenCheck = await enforceTokenLimits(event, organizationId);
  if (!tokenCheck.allowed) {
    throw createError({ statusCode: tokenCheck.statusCode || 402, message: tokenCheck.reason || 'AI token limit reached' });
  }

  const directus = await getUserDirectus(event);

  try {
    // 1. Get or create session
    let chatSessionId = sessionId;
    if (!chatSessionId) {
      try {
        const newSession = await directus.request(
          createItem('ai_chat_sessions', {
            user: userId,
            title: message.trim().substring(0, 100),
            status: 'active',
          }, {
            fields: ['id'],
          }),
        );
        chatSessionId = (newSession as any).id;
      } catch (sessionError: any) {
        console.error('[ai/chat] Failed to create session:', sessionError.message, sessionError.errors || '');
        throw createError({ statusCode: 500, message: `Failed to create chat session: ${sessionError.message}` });
      }
    }

    // 2. Store user message
    try {
      await directus.request(
        createItem('ai_chat_messages', {
          session: chatSessionId,
          role: 'user',
          content: message.trim(),
        }, {
          fields: ['id'],
        }),
      );
    } catch (msgError: any) {
      console.error('[ai/chat] Failed to store user message:', msgError.message, msgError.errors || '');
      throw createError({ statusCode: 500, message: `Failed to store message: ${msgError.message}` });
    }

    // 3. Load conversation history
    const previousMessages = await directus.request(
      readItems('ai_chat_messages', {
        filter: { session: { _eq: chatSessionId } },
        fields: ['role', 'content'],
        sort: ['date_created'],
        limit: 50,
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
    const brandContext = await getBrandContext(event, { clientId, organizationId });

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

    // Build verbosity instruction
    let verbosityContext = '';
    if (verbosity === 'concise') {
      verbosityContext = `\n\nRESPONSE LENGTH: Concise — Keep responses short and to the point.
- Use bullet points and short sentences
- Maximum 2-3 paragraphs per response
- Skip pleasantries and get straight to the answer
- Only include essential details`;
    }

    const systemPrompt = buildSystemPrompt(orgContext) + taskContext + brandContext + styleContext + verbosityContext;

    // 6. Stream response via SSE
    let provider;
    try {
      provider = getLLMProvider();
    } catch (llmError: any) {
      console.error('[ai/chat] LLM provider init failed:', llmError.message);
      throw createError({ statusCode: 500, message: `LLM provider error: ${llmError.message}` });
    }

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

      // Iterate manually to capture the generator's return value (usage metadata)
      let streamResult: any;
      let iterResult = await stream.next();
      while (!iterResult.done) {
        fullResponse += iterResult.value;
        responseWriter.write(`data: ${JSON.stringify({ type: 'chunk', content: iterResult.value })}\n\n`);
        iterResult = await stream.next();
      }
      // The return value from the generator contains usage info
      if (iterResult.value) {
        streamResult = iterResult.value;
      }

      // Log AI usage (fire-and-forget)
      if (streamResult?.usage) {
        logAIUsage({
          event,
          endpoint: 'ai/chat',
          model: streamResult.model || model || 'claude-sonnet-4-20250514',
          inputTokens: streamResult.usage.inputTokens,
          outputTokens: streamResult.usage.outputTokens,
          sessionId: String(chatSessionId),
          organizationId: organizationId,
          metadata: { responseStyle, verbosity },
        }).catch(() => {});

        // Deduct tokens from org balance
        if (organizationId) {
          const totalTokens = (streamResult.usage.inputTokens || 0) + (streamResult.usage.outputTokens || 0);
          deductOrgTokens(organizationId, totalTokens).catch(() => {});
        }
      }

      // 7. Store assistant response
      await directus.request(
        createItem('ai_chat_messages', {
          session: chatSessionId,
          role: 'assistant',
          content: fullResponse,
        }, {
          fields: ['id'],
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
