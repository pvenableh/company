/**
 * Regenerate one touch with a "vary the angle" hint.
 *
 * POST /api/marketing/touches/[id]/regenerate
 * Body: { vary_instruction?: string }
 *
 * Wiring:
 *   ┌─ load touch
 *   ├─ load campaign + recommendation (to get card_type + candidate)
 *   ├─ requireOrgMembership(touch.organization)
 *   ├─ enforceTokenLimits
 *   ├─ snapshot prior touch into regenerate_history (head-of-array prepend)
 *   ├─ buildAvailableFacts(card_type)
 *   ├─ run<CardType>SingleTouchRegenerator(priorTouch, varyInstruction)
 *   ├─ logAIUsage + deductOrgTokens + bump tokens_spent on touch + campaign
 *   ├─ updateItem('marketing_touches', id, {...new fields, regenerate_history})
 *   └─ return updated touch (DraftedTouch shape with id + regenerate_history)
 *
 * Refuses regenerate when touch.status='sent'/'cancelled'/'failed' — only
 * pending or scheduled touches are mutable.
 */
import { readItem, updateItem } from '@directus/sdk';
import { enforceTokenLimits, deductOrgTokens } from '~~/server/utils/ai-token-enforcement';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { buildAvailableFactsForDormant } from '~~/server/utils/marketing-facts/build-dormant-facts';
import { buildAvailableFactsForProjectComplete } from '~~/server/utils/marketing-facts/build-project-complete-facts';
import { buildAvailableFactsForLeadReengagement } from '~~/server/utils/marketing-facts/build-lead-reengagement-facts';
import {
	runDormantSingleTouchRegenerator,
	getResolvedVoice,
	type DormantCandidate,
} from '~~/server/utils/marketing-generators/dormant-clients';
import {
	runProjectCompleteSingleTouchRegenerator,
	type ProjectCompleteCandidate,
} from '~~/server/utils/marketing-generators/project-complete';
import { runLeadReengagementSingleTouchRegenerator } from '~~/server/utils/marketing-generators/lead-reengagement';
import type { LeadReengagementCandidate } from '~~/server/utils/marketing-facts/build-lead-reengagement-facts';
import type { DraftedTouch, TouchHistoryEntry } from '~/composables/useMarketingDrafts';
import type { MarketingTouch } from '~~/shared/marketing-persistence';

const HISTORY_LIMIT = 10;

function snapshotTouch(row: MarketingTouch): TouchHistoryEntry {
	return {
		saved_at: new Date().toISOString(),
		email_subject: row.email_subject,
		email_preview_text: row.email_preview_text,
		email_body_markdown: row.email_body_markdown,
		email_cta: row.email_cta,
		social_channel: row.social_channel,
		social_caption: row.social_caption,
		social_image_brief: row.social_image_brief,
		audience_filter: row.audience_filter,
		send_offset_hours: row.send_offset_hours,
	};
}

export default defineEventHandler(async (event) => {
	const idParam = getRouterParam(event, 'id');
	const touchId = idParam ? Number(idParam) : NaN;
	if (!Number.isFinite(touchId)) {
		throw createError({ statusCode: 400, message: 'Touch ID must be numeric' });
	}

	const body = await readBody<{ vary_instruction?: string }>(event).catch(() => ({}));
	const varyInstruction = body?.vary_instruction;

	const directus = getTypedDirectus();

	const touch = await directus
		.request(
			readItem('marketing_touches', touchId, {
				fields: [
					'id',
					'organization',
					'campaign',
					'sequence_index',
					'kind',
					'audience_target',
					'audience_filter',
					'send_offset_hours',
					'status',
					'email_subject',
					'email_preview_text',
					'email_body_markdown',
					'email_cta',
					'social_channel',
					'social_caption',
					'social_image_brief',
					'regenerate_history',
					'tokens_spent',
				],
			}),
		)
		.catch(() => null) as MarketingTouch | null;

	if (!touch) {
		throw createError({ statusCode: 404, message: 'Touch not found' });
	}
	if (!['pending', 'scheduled'].includes(touch.status)) {
		throw createError({
			statusCode: 409,
			message: `Touch is ${touch.status}; cannot regenerate.`,
		});
	}

	const organizationId: string = touch.organization;
	await requireOrgMembership(event, organizationId);

	const campaign = await directus
		.request(
			readItem('marketing_campaigns', touch.campaign, {
				fields: ['id', 'recommendation', 'card_type', 'tokens_spent'],
			}),
		)
		.catch(() => null) as any;

	if (!campaign) {
		throw createError({ statusCode: 404, message: 'Parent campaign not found' });
	}
	if (!campaign.card_type) {
		throw createError({
			statusCode: 409,
			message: 'Campaign has no card_type — regenerate requires a feed-recommendation campaign.',
		});
	}

	// Recommendation gives us the candidate_data for fact lookup.
	let candidateData: any = {};
	if (campaign.recommendation) {
		const rec = await directus
			.request(
				readItem('marketing_recommendations', campaign.recommendation, {
					fields: ['candidate_data'],
				}),
			)
			.catch(() => null) as any;
		candidateData = rec?.candidate_data || {};
	}

	const tokenCheck = await enforceTokenLimits(event, organizationId);
	if (!tokenCheck.allowed) {
		throw createError({
			statusCode: tokenCheck.statusCode || 402,
			message: tokenCheck.reason || 'AI token limit reached',
		});
	}

	let orgName = 'Your business';
	let orgIndustry = '';
	try {
		const org = await directus.request(
			readItem('organizations', organizationId, { fields: ['name', 'industry'] }),
		) as any;
		if (org?.name) orgName = org.name;
		if (org?.industry) orgIndustry = org.industry;
	} catch {
		// Non-fatal.
	}

	const voice = getResolvedVoice(organizationId);

	const priorTouch: DraftedTouch = {
		id: touch.id,
		kind: touch.kind,
		send_offset_hours: touch.send_offset_hours,
		audience_target: touch.audience_target,
		audience_filter: touch.audience_filter,
		email_subject: touch.email_subject,
		email_preview_text: touch.email_preview_text,
		email_body_markdown: touch.email_body_markdown,
		email_cta: touch.email_cta,
		social_channel: touch.social_channel,
		social_caption: touch.social_caption,
		social_image_brief: touch.social_image_brief,
	};

	let result: {
		touch: DraftedTouch;
		factsUsed: { id: string; label: string; kind: string }[];
		inputTokens: number;
		outputTokens: number;
		durationMs: number;
		promptVersion: string;
		model: string;
		warnings: string[];
		retried: boolean;
	};

	try {
		switch (campaign.card_type) {
			case 'dormant_clients': {
				const facts = await buildAvailableFactsForDormant(organizationId);
				result = await runDormantSingleTouchRegenerator({
					organizationId,
					orgName,
					orgIndustry,
					candidate: candidateData as DormantCandidate,
					facts,
					voice,
					priorTouch,
					varyInstruction,
				});
				break;
			}
			case 'project_complete': {
				const candidate = candidateData as ProjectCompleteCandidate;
				const facts = await buildAvailableFactsForProjectComplete({
					organizationId,
					signal: candidate.signal || {},
					phase: candidate.phase || 'request_testimonial',
				});
				result = await runProjectCompleteSingleTouchRegenerator({
					organizationId,
					orgName,
					orgIndustry,
					candidate,
					facts,
					voice,
					priorTouch,
					varyInstruction,
				});
				break;
			}
			case 'lead_reengagement': {
				const candidate = candidateData as LeadReengagementCandidate;
				const facts = await buildAvailableFactsForLeadReengagement({ organizationId, candidate });
				result = await runLeadReengagementSingleTouchRegenerator({
					organizationId,
					orgName,
					orgIndustry,
					candidate,
					facts,
					voice,
					priorTouch,
					varyInstruction,
				});
				break;
			}
			default:
				throw createError({
					statusCode: 501,
					message: `Single-touch regenerator for card_type "${campaign.card_type}" is not wired.`,
				});
		}
	} catch (err: any) {
		if (err?.statusCode === 501) throw err;
		console.error('[marketing/touches/regenerate] generator failed:', err.message);
		throw createError({
			statusCode: err.statusCode || 502,
			message: err.message || 'Touch regenerate failed',
		});
	}

	// Token accounting — fire-and-forget so we don't fail the user-facing call.
	logAIUsage({
		event,
		endpoint: 'marketing/touches/regenerate',
		model: result.model,
		inputTokens: result.inputTokens,
		outputTokens: result.outputTokens,
		organizationId,
		metadata: {
			card_type: campaign.card_type,
			touch_id: touchId,
			campaign_id: campaign.id,
			prompt_version: result.promptVersion,
			retried: result.retried,
			warnings: result.warnings,
		},
	}).catch(() => {});
	deductOrgTokens(organizationId, result.inputTokens + result.outputTokens).catch(() => {});

	// History head-of-array (newest first), capped at HISTORY_LIMIT to avoid
	// unbounded JSON growth on heavy regenerate sessions.
	const priorHistory = Array.isArray(touch.regenerate_history) ? touch.regenerate_history : [];
	const newHistory: TouchHistoryEntry[] = [snapshotTouch(touch), ...priorHistory].slice(0, HISTORY_LIMIT);

	const newTokensSpent = (touch.tokens_spent || 0) + result.inputTokens + result.outputTokens;

	let updated: any;
	try {
		updated = await directus.request(
			updateItem('marketing_touches', touchId, {
				kind: result.touch.kind,
				audience_filter: result.touch.audience_filter,
				send_offset_hours: result.touch.send_offset_hours,
				email_subject: result.touch.email_subject,
				email_preview_text: result.touch.email_preview_text,
				email_body_markdown: result.touch.email_body_markdown,
				email_cta: result.touch.email_cta,
				social_channel: result.touch.social_channel,
				social_caption: result.touch.social_caption,
				social_image_brief: result.touch.social_image_brief,
				regenerate_history: newHistory,
				tokens_spent: newTokensSpent,
			}),
		);
	} catch (err: any) {
		console.error('[marketing/touches/regenerate] persist failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to save regenerated touch' });
	}

	// Best-effort bump campaign tokens_spent so the drawer header stays accurate.
	directus.request(
		updateItem('marketing_campaigns', campaign.id, {
			tokens_spent: (campaign.tokens_spent || 0) + result.inputTokens + result.outputTokens,
		}),
	).catch((err: any) => console.warn('[marketing/touches/regenerate] campaign bump failed:', err.message));

	const returnedTouch: DraftedTouch = {
		id: touchId,
		kind: updated.kind,
		send_offset_hours: updated.send_offset_hours,
		audience_target: updated.audience_target ?? priorTouch.audience_target,
		audience_filter: updated.audience_filter,
		email_subject: updated.email_subject,
		email_preview_text: updated.email_preview_text,
		email_body_markdown: updated.email_body_markdown,
		email_cta: updated.email_cta,
		social_channel: updated.social_channel,
		social_caption: updated.social_caption,
		social_image_brief: updated.social_image_brief,
		regenerate_history: newHistory,
	};

	return {
		touch: returnedTouch,
		facts_used: result.factsUsed,
		_meta: {
			model: result.model,
			prompt_version: result.promptVersion,
			retried: result.retried,
			warnings: result.warnings,
			duration_ms: result.durationMs,
			input_tokens: result.inputTokens,
			output_tokens: result.outputTokens,
		},
	};
});
