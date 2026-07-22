// server/api/ai/canvas.post.ts
/**
 * Generative Canvas endpoint — the shared brain behind the email, document,
 * and social builders' conversational authoring.
 *
 * It mirrors ai/chat.post.ts (auth, staff gate, token enforcement, session
 * persistence, usage logging) but is purpose-built for drafting an artifact:
 * the model calls apply_canvas_ops to edit the on-screen DRAFT, and we stream
 * those ops to the client as `canvas_ops` SSE events for it to apply + animate.
 * Nothing is sent, published, scheduled, or signed here — it edits a draft.
 *
 * Request body:
 * {
 *   sessionId?: string,
 *   message: string,                 // the user's intent, in plain language
 *   organizationId: string,
 *   canvasKind: 'email'|'document'|'social',
 *   artifact: CanvasArtifact,        // current draft state (blocks + theme)
 *   blockKinds: BlockKindSpec[],     // the builder's block vocabulary
 *   brief?: string,                  // optional session-grounding brief
 *   entityType?, entityId?,          // optional entity to ground brand/context
 *   includedContext?, model?
 * }
 *
 * SSE events: tool_start · canvas_ops · chunk · done · error
 */

import { aggregate, createItem, readItems, updateItem } from '@directus/sdk';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { buildSystemPrompt } from '~~/server/utils/llm/context';
import { getEntityContext } from '~~/server/utils/entity-context';
import { getOrgContext } from '~~/server/utils/context-broker';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { enforceTokenLimits, deductOrgTokens } from '~~/server/utils/ai-token-enforcement';
import type { ChatMessage } from '~~/server/utils/llm/types';
import type { ClaudeProvider } from '~~/server/utils/llm/claude';
import { APPLY_CANVAS_OPS_TOOL, buildCanvasSystemPrompt } from '~~/server/utils/llm/canvas-tools';
import { applyCanvasOps, type CanvasArtifact, type CanvasKind, type CanvasOp } from '~~/shared/canvas';

const VALID_KINDS: CanvasKind[] = ['email', 'document', 'social'];

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const body = await readBody(event);
	const {
		sessionId,
		message,
		model,
		organizationId,
		canvasKind,
		artifact,
		blockKinds,
		brief,
		entityType,
		entityId,
		includedContext,
	} = body || {};

	if (!message?.trim()) throw createError({ statusCode: 400, message: 'Message is required' });
	if (!VALID_KINDS.includes(canvasKind)) throw createError({ statusCode: 400, message: 'Invalid canvasKind' });

	const currentArtifact: CanvasArtifact = {
		title: typeof artifact?.title === 'string' ? artifact.title : undefined,
		blocks: Array.isArray(artifact?.blocks) ? artifact.blocks : [],
		theme: artifact?.theme && typeof artifact.theme === 'object' ? artifact.theme : undefined,
	};
	const kinds = Array.isArray(blockKinds) ? blockKinds : [];

	const ctxGate: Set<string> | null = Array.isArray(includedContext) ? new Set(includedContext) : null;
	const allowCtx = (k: string) => !ctxGate || ctxGate.has(k);

	// Staff gate — canvas authoring is for Earnest staff, same as ai/chat.
	try {
		const sysDirectus = getTypedDirectus();
		const memberships = (await sysDirectus.request(
			aggregate('org_memberships', {
				aggregate: { count: ['*'] },
				query: { filter: { _and: [{ user: { _eq: userId } }, { status: { _eq: 'active' } }] } },
			}),
		)) as any[];
		if (Number(memberships?.[0]?.count ?? 0) === 0) {
			throw createError({
				statusCode: 403,
				statusMessage: 'AI is for Earnest staff',
				data: { sellSheet: true, reason: 'portal_user', message: 'Earnest AI is for Earnest team members.' },
			});
		}
	} catch (err: any) {
		if (err?.statusCode === 403) throw err;
		console.warn('[ai/canvas] staff gate check failed open:', err?.message);
	}

	// Token enforcement.
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
		// 1. Session (reuses the shared ai_chat_* tables; tagged as a canvas session).
		let chatSessionId = sessionId;
		if (!chatSessionId) {
			const sessionData: Record<string, any> = {
				user: userId,
				title: message.trim().substring(0, 100),
				status: 'active',
				context: { canvas: canvasKind, entityType: entityType || null, entityId: entityId || null },
			};
			const newSession = await directus.request(createItem('ai_chat_sessions', sessionData, { fields: ['id'] }));
			chatSessionId = (newSession as any).id;
		}

		// 2. Store the user message.
		await directus.request(
			createItem('ai_chat_messages', { session: chatSessionId, role: 'user', content: message.trim() }, { fields: ['id'] }),
		);

		// 3. Conversation history (so refinements build on prior turns).
		const previousMessages = (await directus.request(
			readItems('ai_chat_messages', {
				filter: { session: { _eq: chatSessionId } },
				fields: ['role', 'content'],
				sort: ['date_created'],
				limit: 40,
			}),
		)) as Array<{ role: string; content: string }>;

		const chatMessages: ChatMessage[] = previousMessages.map((m) => ({
			role: m.role as 'user' | 'assistant',
			content: m.content,
		}));

		// 4. Context — org brand/voice (broker) + optional entity grounding.
		const userData = (session as any).user;
		const userName = userData?.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : undefined;

		const [cachedContext, entityContext] = await Promise.all([
			organizationId && allowCtx('organization') ? getOrgContext(organizationId).catch(() => null) : Promise.resolve(null),
			entityType && entityId && organizationId && allowCtx('entity')
				? getEntityContext(entityType, entityId, organizationId, userId).catch(() => '')
				: Promise.resolve(''),
		]);

		const orgContext = {
			userName,
			clientsSummary: cachedContext?.clientsSummary || undefined,
		};
		const brandContext = cachedContext?.brandSummary ? `\n\n${cachedContext.brandSummary}` : '';
		const entityBlock = entityContext ? `\n\n${entityContext}` : '';

		const canvasBlock = buildCanvasSystemPrompt({ kind: canvasKind, blockKinds: kinds, artifact: currentArtifact, brief });

		const systemPrompt = buildSystemPrompt(orgContext) + brandContext + entityBlock + canvasBlock;

		// 5. Provider + SSE.
		const provider = getLLMProvider();
		setResponseHeaders(event, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		});
		const res = event.node.res;

		let fullResponse = '';
		let usage: { inputTokens: number; outputTokens: number } | undefined;
		const usedModel = model || 'claude-sonnet-5';
		let streamError: Error | null = null;

		if (typeof (provider as any).chatWithTools === 'function') {
			try {
				const claude = provider as ClaudeProvider;
				const llmOptions = { model, systemPrompt, maxTokens: 4096, tools: [APPLY_CANVAS_OPS_TOOL] };
				const anthropicMsgs = claude.toAnthropicMessageParams(chatMessages);

				const round1 = await claude.chatWithTools(anthropicMsgs, llmOptions);

				if (round1.stopReason === 'tool_use' && round1.toolCalls.length > 0) {
					const toolResultContents: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = [];
					// Apply ops server-side to the running artifact so each tool call
					// validates against the state left by the previous one.
					let running = currentArtifact;

					for (const tc of round1.toolCalls) {
						res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: tc.name })}\n\n`);

						if (tc.name === 'apply_canvas_ops') {
							const ops = Array.isArray(tc.input?.ops) ? (tc.input.ops as CanvasOp[]) : [];
							const note = typeof tc.input?.note === 'string' ? tc.input.note : undefined;
							const applied = applyCanvasOps(running, ops);
							running = applied.artifact;

							res.write(
								`data: ${JSON.stringify({
									type: 'canvas_ops',
									ops,
									note,
									change: {
										added: applied.added,
										removed: applied.removed,
										updated: applied.updated,
										reordered: applied.reordered,
										themed: applied.themed,
									},
								})}\n\n`,
							);

							toolResultContents.push({
								type: 'tool_result',
								tool_use_id: tc.id,
								content: JSON.stringify({
									success: true,
									applied: {
										added: applied.added.length,
										removed: applied.removed.length,
										updated: applied.updated.length,
										reordered: applied.reordered,
										blockCount: running.blocks.length,
									},
								}),
							});
						} else {
							// Unknown tool — report failure back so the model recovers.
							toolResultContents.push({
								type: 'tool_result',
								tool_use_id: tc.id,
								content: JSON.stringify({ success: false, error: `Unknown tool ${tc.name}` }),
								is_error: true,
							});
						}
					}

					// Round 2: let Claude give its short spoken reply after editing.
					const round2Messages = [
						...anthropicMsgs,
						{ role: 'assistant' as const, content: round1.rawContent },
						{ role: 'user' as const, content: toolResultContents },
					];
					const round2 = await claude.chatWithTools(round2Messages, llmOptions);
					fullResponse = round2.text || round1.text || '';
					// Fold both rounds' usage together for accurate billing.
					usage = {
						inputTokens: (round1.usage?.inputTokens || 0) + (round2.usage?.inputTokens || 0),
						outputTokens: (round1.usage?.outputTokens || 0) + (round2.usage?.outputTokens || 0),
					};
					if (fullResponse) res.write(`data: ${JSON.stringify({ type: 'chunk', content: fullResponse })}\n\n`);
				} else {
					// No ops — a plain conversational reply (e.g. asking a clarifying question).
					fullResponse = round1.text;
					usage = round1.usage;
					if (fullResponse) res.write(`data: ${JSON.stringify({ type: 'chunk', content: fullResponse })}\n\n`);
				}
			} catch (e: any) {
				streamError = e;
			}
		} else {
			streamError = new Error('Canvas authoring requires the Claude provider');
		}

		// 6. Usage accounting.
		if (usage) {
			logAIUsage({
				event,
				endpoint: 'ai/canvas',
				model: usedModel,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				sessionId: String(chatSessionId),
				organizationId,
				metadata: { canvasKind },
			}).catch(() => {});
			if (organizationId && !isDemoMockEvent(event)) {
				deductOrgTokens(organizationId, (usage.inputTokens || 0) + (usage.outputTokens || 0)).catch(() => {});
			}
		}

		// 7. Persist the assistant reply.
		let assistantMessageId: string | null = null;
		try {
			const persisted = (await directus.request(
				createItem(
					'ai_chat_messages',
					{
						session: chatSessionId,
						role: 'assistant',
						content: fullResponse || (streamError ? `[canvas error — ${streamError.message}]` : ''),
						metadata: streamError ? { error: streamError.message } : undefined,
					},
					{ fields: ['id'] },
				),
			)) as any;
			assistantMessageId = persisted?.id != null ? String(persisted.id) : null;
		} catch (e: any) {
			console.error('[ai/canvas] Failed to persist assistant message:', e.message);
		}

		if (!sessionId) {
			await directus
				.request(updateItem('ai_chat_sessions', chatSessionId, { title: message.trim().substring(0, 100) }))
				.catch(() => {});
		}

		if (streamError) {
			res.write(
				`data: ${JSON.stringify({ type: 'error', error: streamError.message || 'Canvas draft failed', sessionId: chatSessionId, assistantMessageId })}\n\n`,
			);
		} else {
			res.write(
				`data: ${JSON.stringify({ type: 'done', sessionId: chatSessionId, content: fullResponse, assistantMessageId })}\n\n`,
			);
		}
		res.end();
	} catch (error: any) {
		console.error('[ai/canvas] Error:', error);
		throw createError({ statusCode: error.statusCode || 500, message: error.message || 'Canvas draft failed' });
	}
});
