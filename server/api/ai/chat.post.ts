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
import { aggregate } from '@directus/sdk';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { buildSystemPrompt, formatNotesContext } from '~~/server/utils/llm/context';
import { getEntityContext } from '~~/server/utils/entity-context';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { enforceTokenLimits, deductOrgTokens } from '~~/server/utils/ai-token-enforcement';
import { getBrandContext } from '~~/server/utils/brand-context';
import { getOrgContext } from '~~/server/utils/context-broker';
import type { ChatMessage } from '~~/server/utils/llm/types';
import { MUTATION_TOOLS } from '~~/server/utils/llm/tools';
import { executeToolCall } from '~~/server/utils/llm/tool-handlers';
import type { ClaudeProvider } from '~~/server/utils/llm/claude';

export default defineEventHandler(async (event) => {
  // Require authentication
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;

  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody(event);
  const { sessionId, message, model, clientId, organizationId, responseStyle, verbosity, entityType, entityId, allowMutations } = body;

  if (!message?.trim()) {
    throw createError({ statusCode: 400, message: 'Message is required' });
  }

  // Item 13 — Earnest staff gate. AI chat is for Earnest staff (owner / admin
  // / manager / member). Client-portal-only users get a 403 with the
  // sell-sheet flag so the client can route them to the upgrade modal
  // instead of just toasting an error. We check the unscoped membership
  // count: any active org_membership in any org is enough to call this an
  // Earnest user.
  try {
    const sysDirectus = getTypedDirectus();
    const memberships = await sysDirectus.request(
      aggregate('org_memberships', {
        aggregate: { count: ['*'] },
        query: {
          filter: {
            _and: [
              { user: { _eq: userId } },
              { status: { _eq: 'active' } },
            ],
          },
        },
      }),
    ) as any[];
    const membershipCount = Number(memberships?.[0]?.count ?? 0);
    if (membershipCount === 0) {
      throw createError({
        statusCode: 403,
        statusMessage: 'AI is for Earnest staff',
        data: {
          sellSheet: true,
          reason: 'portal_user',
          message: 'Earnest AI is for Earnest team members. Ask your account owner to invite you as staff to use the assistant.',
        },
      });
    }
  } catch (err: any) {
    if (err?.statusCode === 403) throw err;
    // If the gate check itself throws for unrelated reasons (Directus
    // hiccup), log and continue — failing closed would lock out staff
    // whenever Directus has a bad day.
    console.warn('[ai/chat] staff gate check failed open:', err?.message);
  }

  // Enforce AI token limits before proceeding
  const tokenCheck = await enforceTokenLimits(event, organizationId);
  if (!tokenCheck.allowed) {
    throw createError({
      statusCode: tokenCheck.statusCode || 402,
      message: tokenCheck.reason || 'AI token limit reached',
      data: {
        sellSheet: true,
        reason: 'tokens_depleted',
        orgTokensRemaining: tokenCheck.orgTokensRemaining ?? null,
        memberBudgetRemaining: tokenCheck.memberBudgetRemaining ?? null,
      },
    });
  }

  const directus = await getUserDirectus(event);

  try {
    // 1. Get or create session
    let chatSessionId = sessionId;
    if (!chatSessionId) {
      try {
        const sessionData: Record<string, any> = {
            user: userId,
            title: message.trim().substring(0, 100),
            status: 'active',
        };
        // Store entity context so we can find this session later by entity
        if (entityType && entityId) {
          sessionData.context = { entityType, entityId };
        }
        const newSession = await directus.request(
          createItem('ai_chat_sessions', sessionData, {
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

    // 3. Load conversation history (with feedback for correction annotations)
    const previousMessages = await directus.request(
      readItems('ai_chat_messages', {
        filter: { session: { _eq: chatSessionId } },
        fields: ['role', 'content', 'feedback'],
        sort: ['date_created'],
        limit: 50,
      }),
    ) as Array<{ role: string; content: string; feedback?: { rating?: string; correction?: string } }>;

    // 4. Build messages array for LLM — annotate corrected assistant messages
    const chatMessages: ChatMessage[] = previousMessages.map((m) => {
      // If user gave negative feedback with a correction, annotate the assistant message
      // so the model learns from the correction in this conversation
      if (m.role === 'assistant' && m.feedback?.rating === 'negative' && m.feedback?.correction) {
        return {
          role: 'assistant' as const,
          content: m.content + `\n\n[USER CORRECTION: ${m.feedback.correction}]`,
        };
      }
      return {
        role: m.role as 'user' | 'assistant',
        content: m.content,
      };
    });

    // 5. Build operational context via Context Broker (cached) + user tasks (fresh)
    const userData = (session as any).user;
    const userName = userData?.first_name
      ? `${userData.first_name} ${userData.last_name || ''}`.trim()
      : undefined;

    const now = new Date();

    // Parallel: cached org context from broker + fresh user tasks + client brand override + entity context + saved notes
    const [cachedContext, taskContext, clientBrandContext, entityContext, notesContext] = await Promise.all([
      // Org context from broker (L1 → L2 → L3 with stale-while-revalidate)
      organizationId ? getOrgContext(organizationId).catch(() => null) : Promise.resolve(null),

      // User tasks — always fresh (user-scoped, cheap query)
      (async () => {
        try {
          const tasks = await directus.request(
            readItems('project_tasks', {
              filter: { assignee_id: { _eq: userId } },
              fields: ['id', 'title', 'status', 'completed', 'due_date', 'priority'],
              sort: ['-due_date'],
              limit: 30,
            }),
          ) as Array<{ id: string; title: string; status: string; completed: boolean; due_date: string; priority: string }>;

          if (tasks.length === 0) return '';

          const pending = tasks.filter(t => !t.completed);
          const overdue = pending.filter(t => t.due_date && new Date(t.due_date) < now);
          const completed = tasks.filter(t => t.completed);

          let ctx = `\n\nUSER'S CURRENT TASKS (${tasks.length} total, ${pending.length} pending, ${completed.length} completed${overdue.length ? `, ${overdue.length} overdue` : ''}):\n`;
          ctx += pending.slice(0, 15).map(t =>
            `- [${t.completed ? 'x' : ' '}] ${t.title}${t.due_date ? ` (due: ${t.due_date})` : ''}${t.priority ? ` [${t.priority}]` : ''}${t.status ? ` — ${t.status}` : ''}`,
          ).join('\n');
          if (overdue.length > 0) {
            ctx += `\n\nOVERDUE TASKS:\n`;
            ctx += overdue.map(t => `- ${t.title} (was due: ${t.due_date})`).join('\n');
          }
          return ctx;
        } catch { return ''; }
      })(),

      // Client-specific brand override (only when a specific client is selected)
      clientId ? getBrandContext(event, { clientId, organizationId }) : Promise.resolve(''),

      // Entity-scoped context (when chatting from an entity detail page)
      entityType && entityId && organizationId
        ? getEntityContext(entityType, entityId, organizationId).catch(() => '')
        : Promise.resolve(''),

      // User's pinned notes + entity-tagged notes (always fresh, user-scoped)
      organizationId ? (async () => {
        try {
          const orConditions: any[] = [{ is_pinned: { _eq: true } }];
          if (entityType && entityId) {
            orConditions.push({
              tags: {
                ai_tags_id: {
                  _and: [
                    { entity_type: { _eq: entityType } },
                    { entity_id: { _eq: entityId } },
                  ],
                },
              },
            });
          }

          const notes = await directus.request(
            readItems('ai_notes', {
              filter: {
                _and: [
                  { user: { _eq: userId } },
                  { organization: { _eq: organizationId } },
                  { status: { _eq: 'active' } },
                  { _or: orConditions },
                ],
              },
              fields: ['id', 'title', 'content', 'is_pinned', 'tags.ai_tags_id.name'],
              sort: ['-is_pinned', '-date_updated'],
              limit: 10,
            }),
          ) as any[];

          return formatNotesContext(notes);
        } catch { return ''; }
      })() : Promise.resolve(''),
    ]);

    const orgContext = {
      userName,
      clientsSummary: cachedContext?.clientsSummary || undefined,
      projectsSummary: cachedContext?.projectsSummary || undefined,
      invoicesSummary: cachedContext?.invoicesSummary || undefined,
      dealsSummary: cachedContext?.dealsSummary || undefined,
      ticketsSummary: cachedContext?.ticketsSummary || undefined,
      contactsSummary: cachedContext?.contactsSummary || undefined,
    };

    // Brand context: client-specific override takes priority, else use broker's org-level brand
    const brandContext = clientBrandContext || (cachedContext?.brandSummary ? `\n\n${cachedContext.brandSummary}` : '');

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

    // Entity context (Layer 4): focused context when chatting from an entity detail page
    const entityBlock = entityContext ? `\n\n${entityContext}` : '';

    // When the chat opts into mutation tools, give Claude an unambiguous handle
    // to the focused record + permission to use the tools without asking. Without
    // this, the model often hallucinates an id (or asks the user) instead of
    // calling reschedule_project / update_field with the real UUID.
    const useMutationTools = allowMutations === true && entityType && entityId && organizationId;
    const toolNudge = useMutationTools
      ? `\n\nTOOLS ENABLED: You can mutate this entity directly. The user's currently focused record is ${entityType}="${entityId}" in organization="${organizationId}". When the user asks to reschedule, update, or add — call the matching tool (reschedule_project / update_field / add_task) with this exact id. Do NOT refuse or describe the change; execute it. If a tool returns success:false, surface the error verbatim instead of inventing a permission excuse.`
      : '';

    const systemPrompt = buildSystemPrompt(orgContext) + notesContext + taskContext + brandContext + entityBlock + toolNudge + styleContext + verbosityContext;

    // 6. Stream/tool response via SSE
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
    let streamResult: any;
    let streamError: Error | null = null;

    // Tools are enabled when: the client opted in (allowMutations=true), an entity is focused,
    // and the provider is ClaudeProvider (which has chatWithTools).
    if (useMutationTools && typeof (provider as any).chatWithTools === 'function') {
      // ── Tool-aware path ──────────────────────────────────────────────────────
      // Round 1: ask Claude — it may respond with text, or request a tool call.
      // Round 2 (if tool called): execute tool, send result back, get final text.
      try {
        const claudeProvider = provider as ClaudeProvider;
        const llmOptions = { model, systemPrompt, maxTokens: 4096, tools: MUTATION_TOOLS };

        // Build Anthropic-format messages from conversation history
        const anthropicMsgs = claudeProvider.toAnthropicMessageParams(chatMessages);

        const round1 = await claudeProvider.chatWithTools(anthropicMsgs, llmOptions);

        if (round1.stopReason === 'tool_use' && round1.toolCalls.length > 0) {
          const toolResultContents: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = [];

          for (const tc of round1.toolCalls) {
            responseWriter.write(
              `data: ${JSON.stringify({ type: 'tool_start', tool: tc.name, input: tc.input })}\n\n`,
            );

            const result = await executeToolCall(tc.name, tc.input, { organizationId, userId });

            responseWriter.write(
              `data: ${JSON.stringify({
                type: 'tool_done',
                tool: tc.name,
                success: result.success,
                summary: result.success ? result.summary : (result.error || 'Tool failed'),
                data: result.data,
              })}\n\n`,
            );

            toolResultContents.push({
              type: 'tool_result',
              tool_use_id: tc.id,
              content: result.success
                ? JSON.stringify({ success: true, summary: result.summary, ...result.data })
                : JSON.stringify({ success: false, error: result.error }),
              is_error: !result.success,
            });
          }

          // Round 2: append assistant's tool_use blocks + tool results, then get follow-up text.
          // Anthropic requires: [...history, {role:'assistant', content: rawContent}, {role:'user', content: tool_results}]
          const round2Messages = [
            ...anthropicMsgs,
            { role: 'assistant' as const, content: round1.rawContent },
            { role: 'user' as const, content: toolResultContents },
          ];

          const round2 = await claudeProvider.chatWithTools(round2Messages, llmOptions);
          fullResponse = round2.text;
          streamResult = round2.usage ? { usage: round2.usage, model: model || 'claude-sonnet-4-20250514' } : undefined;

          if (fullResponse) {
            responseWriter.write(`data: ${JSON.stringify({ type: 'chunk', content: fullResponse })}\n\n`);
          }
        } else {
          // No tool call — plain text response
          fullResponse = round1.text;
          streamResult = round1.usage ? { usage: round1.usage, model: model || 'claude-sonnet-4-20250514' } : undefined;
          if (fullResponse) {
            responseWriter.write(`data: ${JSON.stringify({ type: 'chunk', content: fullResponse })}\n\n`);
          }
        }
      } catch (e: any) {
        streamError = e;
      }
    } else {
      // ── Standard streaming path (read-only) ──────────────────────────────────
      try {
        const stream = provider.chatStream(chatMessages, {
          model,
          systemPrompt,
          maxTokens: 4096,
        });

        let iterResult = await stream.next();
        while (!iterResult.done) {
          fullResponse += iterResult.value;
          responseWriter.write(`data: ${JSON.stringify({ type: 'chunk', content: iterResult.value })}\n\n`);
          iterResult = await stream.next();
        }
        if (iterResult.value) {
          streamResult = iterResult.value;
        }
      } catch (e: any) {
        streamError = e;
      }
    }

    // Log AI usage (fire-and-forget). Only possible when the stream returned usage metadata.
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

      if (organizationId) {
        const totalTokens = (streamResult.usage.inputTokens || 0) + (streamResult.usage.outputTokens || 0);
        deductOrgTokens(organizationId, totalTokens).catch(() => {});
      }
    }

    // Always persist an assistant row — partial, empty, or whole — so the session stays
    // coherent even if the stream died mid-flight. Without this, a transient upstream error
    // leaves the session with a dangling user message and nothing else.
    let assistantMessageId: string | null = null;
    try {
      const persistedContent = fullResponse || (streamError
        ? `[stream interrupted — ${streamError.message || 'unknown error'}]`
        : '');

      const persisted = await directus.request(
        createItem('ai_chat_messages', {
          session: chatSessionId,
          role: 'assistant',
          content: persistedContent,
          metadata: streamError
            ? { error: streamError.message, partial: fullResponse.length > 0 }
            : undefined,
        }, {
          fields: ['id'],
        }),
      ) as any;
      assistantMessageId = persisted?.id != null ? String(persisted.id) : null;
    } catch (persistError: any) {
      console.error('[ai/chat] Failed to persist assistant message:', persistError.message);
    }

    // Update session title on the first exchange (best-effort)
    if (!sessionId) {
      const title = message.trim().substring(0, 100);
      await directus.request(
        updateItem('ai_chat_sessions', chatSessionId, { title }),
      ).catch(() => {});
    }

    // Final SSE event — error if the stream died, done otherwise
    if (streamError) {
      responseWriter.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: streamError.message || 'Stream failed',
          sessionId: chatSessionId,
          content: fullResponse,
          assistantMessageId,
        })}\n\n`,
      );
    } else {
      responseWriter.write(
        `data: ${JSON.stringify({
          type: 'done',
          sessionId: chatSessionId,
          content: fullResponse,
          assistantMessageId,
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
