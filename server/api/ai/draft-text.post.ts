// server/api/ai/draft-text.post.ts
/**
 * Generic "Draft with Earnest" text generator for inline single-field drafting
 * (app/components/AI/EarnestDraftButton.vue, via useEarnestDraft().generateText).
 *
 * Given a short brief + a `kind` label, returns ready-to-use plain-text copy for
 * whatever field the caller is filling (a proposal overview, an email body, a
 * task description, etc.). Distinct from the social generator (per-platform posts)
 * and generate-documents (whole proposal/contract blocks).
 *
 * Returns: { text: string }  — plain text, no markdown wrapper.
 */
import { z } from 'zod';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import { getBrandContext } from '~~/server/utils/brand-context';
import type { ChatMessage } from '~~/server/utils/llm/types';

const bodySchema = z.object({
  brief: z.string().min(1).max(4000),
  kind: z.string().max(60).optional(),
  tone: z.string().max(60).optional(),
  currentValue: z.string().max(8000).nullable().optional(),
  maxWords: z.number().int().min(20).max(1200).optional(),
  clientId: z.string().uuid().nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
});

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Validation failed', data: parsed.error.flatten() });
  }
  const body = parsed.data;

  const tokenCheck = await enforceTokenLimits(event, body.organizationId ?? undefined);
  if (!tokenCheck.allowed) {
    throw createError({ statusCode: tokenCheck.statusCode || 402, message: tokenCheck.reason || 'AI token limit reached' });
  }

  const brand = await getBrandContext(event, {
    clientId: body.clientId ?? undefined,
    organizationId: body.organizationId ?? undefined,
  });

  const kind = (body.kind || 'text').trim();
  const maxWords = body.maxWords ?? 220;

  const systemPrompt = [
    `You are Earnest, drafting ${kind} for the user to drop straight into a field.`,
    body.tone ? `Tone: ${body.tone}.` : '',
    `Write clear, specific, ready-to-use copy — no preamble, no sign-off, no meta commentary.`,
    `Return ONLY the ${kind} itself as plain text — no markdown headers, no bullet asterisks, no quotes, no "Here's..." framing.`,
    `Keep it under about ${maxWords} words unless the brief clearly needs more.`,
    `Ground it in the brand details provided; do not invent facts (names, prices, dates) that aren't given.`,
  ].filter(Boolean).join('\n');

  const userMessage = [
    body.currentValue?.trim() ? `Current draft to improve/replace:\n${body.currentValue.trim()}\n` : '',
    `Brief: ${body.brief.trim()}`,
    brand,
  ].filter(Boolean).join('\n');

  const provider = getLLMProvider();
  try {
    const response = await provider.chat([{ role: 'user', content: userMessage } as ChatMessage], {
      systemPrompt,
      maxTokens: 1500,
    });

    let text = (response.content || '').trim();
    if (text.startsWith('```')) text = text.replace(/^```(?:\w+)?\n?/, '').replace(/\n?```$/, '').trim();
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('“') && text.endsWith('”'))) {
      text = text.slice(1, -1).trim();
    }

    if (response.usage) {
      logAIUsage({
        event, endpoint: 'ai/draft-text', model: response.model,
        inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens,
        organizationId: body.organizationId ?? undefined, metadata: { kind },
      }).catch(() => {});
    }

    return { text };
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('[ai/draft-text] LLM error:', error?.message);
    throw createError({ statusCode: 500, message: 'Earnest could not draft this. Please try again.' });
  }
});
