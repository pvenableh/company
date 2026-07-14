/**
 * Generate a DRAFT proposal + contract from a plain-language overview.
 *
 * This is the first "action" in Earnest AI's human-in-the-loop action layer:
 * the user describes the project deliverables, Earnest drafts both documents as
 * typed blocks, and creates them in `draft` status. The drafts are the
 * reviewable, fully-editable artifacts — nothing is sent or signed here. The
 * generation is recorded in `ai_actions` as an audit entry.
 *
 * Body:
 *   overview        (required) — plain-language description of the deliverables
 *   organizationId  (required)
 *   leadId?         — originating lead (grounds context + links the docs)
 *   clientId?       — client to link the contract to
 *   contactId?      — recipient/signer contact
 *   targets?        — ['proposal','contract'] (default both)
 *   create?         — default true; when false, returns blocks without saving
 *
 * Why the admin client + requireOrgMembership: create permissions on
 * proposals/contracts are FK-walked by organization, which Directus 11 doesn't
 * enforce on `create` — same pattern as contracts/from-proposal.
 */
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { enforceTokenLimits, deductOrgTokens } from '~~/server/utils/ai-token-enforcement';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { generateDocuments, persistDraftDocuments } from '~~/server/utils/generate-documents';
import { logAiAction } from '~~/server/utils/ai-actions';

// Usage-log label only — the actual generation uses the shared provider's
// configured default model (see getLLMProvider / ClaudeProvider).
const DEFAULT_MODEL = 'claude-sonnet-5';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

  const body = await readBody(event);
  const overview: string = (body?.overview || '').toString().trim();
  const organizationId: string = (body?.organizationId || '').toString();
  const leadId = body?.leadId ?? null;
  const clientId = body?.clientId ?? null;
  const contactId = body?.contactId ?? null;
  const create = body?.create !== false; // default true
  const targets: Array<'proposal' | 'contract'> = Array.isArray(body?.targets) && body.targets.length
    ? body.targets.filter((t: string) => t === 'proposal' || t === 'contract')
    : ['proposal', 'contract'];

  if (!overview) throw createError({ statusCode: 400, message: 'overview is required' });
  if (!organizationId) throw createError({ statusCode: 400, message: 'organizationId is required' });

  // Gate on AI token limits, then verify org membership before any writes.
  const tokenCheck = await enforceTokenLimits(event, organizationId);
  if (!tokenCheck.allowed) {
    throw createError({
      statusCode: tokenCheck.statusCode || 402,
      message: tokenCheck.reason || 'AI token limit reached',
      data: { sellSheet: true, reason: 'tokens_depleted' },
    });
  }
  await requireOrgMembership(event, organizationId);

  const provider = getLLMProvider();
  const gen = await generateDocuments({
    overview,
    organizationId,
    leadId,
    clientId,
    contactId,
    targets,
    provider,
  });

  // Log AI usage (fire-and-forget) + deduct org tokens.
  if (gen.usage) {
    logAIUsage({
      event,
      endpoint: 'ai/generate-documents',
      model: DEFAULT_MODEL,
      inputTokens: gen.usage.inputTokens,
      outputTokens: gen.usage.outputTokens,
      organizationId,
      metadata: { targets },
    }).catch(() => {});
    // Mocked demo sessions spend nothing — log usage but never deduct.
    if (!isDemoMockEvent(event)) {
      deductOrgTokens(organizationId, (gen.usage.inputTokens || 0) + (gen.usage.outputTokens || 0)).catch(() => {});
    }
  }

  // Preview-only mode: return generated blocks without persisting.
  if (!create) {
    await logAiAction({
      organizationId, userId,
      actionType: 'generate_documents',
      status: 'pending',
      title: `Draft ${targets.join(' + ')}: ${gen.title}`,
      payload: { overview, targets, leadId, clientId, contactId },
      preview: { title: gen.title, proposalBlocks: gen.proposalBlocks.length, contractBlocks: gen.contractBlocks.length },
      entityType: leadId != null ? 'leads' : null,
      entityId: leadId != null ? String(leadId) : null,
    });
    return {
      created: false,
      title: gen.title,
      total_value: gen.total_value,
      valid_until: gen.valid_until,
      proposalBlocks: gen.proposalBlocks,
      contractBlocks: gen.contractBlocks,
    };
  }

  // Create DRAFT rows + audit (admin client; membership already verified).
  const { proposalId, contractId } = await persistDraftDocuments(gen, {
    organizationId, userId, leadId, clientId, contactId, targets, overview,
  });

  return {
    created: true,
    title: gen.title,
    total_value: gen.total_value,
    valid_until: gen.valid_until,
    proposalId,
    contractId,
  };
});
