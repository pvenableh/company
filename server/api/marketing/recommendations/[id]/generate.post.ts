/**
 * Generate a marketing draft for a recommendation — runs the Anthropic
 * generator, validates the output, deducts org tokens, flips the
 * recommendation to status='drafted', and returns a DraftedCampaign-shaped
 * payload identical to the stub composable.
 *
 * POST /api/marketing/recommendations/[id]/generate
 *
 * Wiring:
 *   ┌─ requireOrgMembership
 *   ├─ enforceTokenLimits (org balance / per-member budget)
 *   ├─ load recommendation, verify status pending|drafted
 *   ├─ build available_facts (deterministic, per-card-type)
 *   ├─ runDormantGenerator (or per-card-type generator)
 *   ├─ logAIUsage + deductOrgTokens
 *   ├─ update recommendation: status='drafted'
 *   └─ return DraftedCampaign JSON
 *
 * Routes via server token after gating in app code (same pattern as the
 * rest of the marketing routes — collections have no row-level perms).
 */
import { readItem, updateItem } from '@directus/sdk';
import { enforceTokenLimits, deductOrgTokens } from '~~/server/utils/ai-token-enforcement';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { buildAvailableFactsForDormant } from '~~/server/utils/marketing-facts/build-dormant-facts';
import { buildAvailableFactsForProjectComplete } from '~~/server/utils/marketing-facts/build-project-complete-facts';
import { buildAvailableFactsForLeadReengagement } from '~~/server/utils/marketing-facts/build-lead-reengagement-facts';
import {
	runDormantGenerator,
	getResolvedVoice,
	type DormantCandidate,
} from '~~/server/utils/marketing-generators/dormant-clients';
import {
	runProjectCompleteGenerator,
	type ProjectCompleteCandidate,
} from '~~/server/utils/marketing-generators/project-complete';
import {
	runLeadReengagementGenerator,
} from '~~/server/utils/marketing-generators/lead-reengagement';
import type { LeadReengagementCandidate } from '~~/server/utils/marketing-facts/build-lead-reengagement-facts';

export default defineEventHandler(async (event) => {
	const idParam = getRouterParam(event, 'id');
	const recommendationId = idParam ? Number(idParam) : NaN;
	if (!Number.isFinite(recommendationId)) {
		throw createError({ statusCode: 400, message: 'Recommendation ID must be numeric' });
	}

	const directus = getTypedDirectus();

	// Load the recommendation first — we need the org id to gate on.
	const rec = await directus
		.request(
			readItem('marketing_recommendations', recommendationId, {
				fields: ['id', 'organization', 'card_type', 'status', 'candidate_data'],
			}),
		)
		.catch(() => null) as any;

	if (!rec) {
		throw createError({ statusCode: 404, message: 'Recommendation not found' });
	}
	if (!['pending', 'drafted'].includes(rec.status)) {
		throw createError({
			statusCode: 409,
			message: `Recommendation is ${rec.status}; cannot regenerate.`,
		});
	}

	const organizationId: string = rec.organization;
	await requireOrgMembership(event, organizationId);

	// Token gate — block before spending API credits.
	const tokenCheck = await enforceTokenLimits(event, organizationId);
	if (!tokenCheck.allowed) {
		throw createError({
			statusCode: tokenCheck.statusCode || 402,
			message: tokenCheck.reason || 'AI token limit reached',
		});
	}

	// Org name for the prompt.
	let orgName = 'Your business';
	let orgIndustry = '';
	try {
		const org = await directus.request(
			readItem('organizations', organizationId, {
				fields: ['name', 'industry'],
			}),
		) as any;
		if (org?.name) orgName = org.name;
		if (org?.industry) orgIndustry = org.industry;
	} catch {
		// Non-fatal — fall back to defaults.
	}

	// Dispatch by card_type. Each generator returns the same DraftedCampaign
	// shape so downstream wiring (token logging, drawer rendering, schedule)
	// is identical. Card types not in this switch fall through to 501 so the
	// client uses the dev stub.
	const voice = getResolvedVoice(organizationId);
	const candidateData = (rec.candidate_data || {}) as any;

	let result: {
		draft: any;
		inputTokens: number;
		outputTokens: number;
		durationMs: number;
		promptVersion: string;
		model: string;
		warnings: string[];
		retried: boolean;
	};
	try {
		switch (rec.card_type) {
			case 'dormant_clients': {
				const facts = await buildAvailableFactsForDormant(organizationId);
				result = await runDormantGenerator({
					organizationId,
					orgName,
					orgIndustry,
					candidate: candidateData as DormantCandidate,
					facts,
					voice,
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
				result = await runProjectCompleteGenerator({
					organizationId,
					orgName,
					orgIndustry,
					candidate,
					facts,
					voice,
				});
				break;
			}
			case 'lead_reengagement': {
				const candidate = candidateData as LeadReengagementCandidate;
				const facts = await buildAvailableFactsForLeadReengagement({ organizationId, candidate });
				result = await runLeadReengagementGenerator({
					organizationId,
					orgName,
					orgIndustry,
					candidate,
					facts,
					voice,
				});
				break;
			}
			default:
				throw createError({
					statusCode: 501,
					message: `Generator for card_type "${rec.card_type}" is not yet wired. Use the dev stub fallback.`,
				});
		}
	} catch (err: any) {
		if (err?.statusCode === 501) throw err;
		console.error('[marketing/generate] generator failed:', err.message);
		throw createError({
			statusCode: err.statusCode || 502,
			message: err.message || 'Marketing generator failed',
		});
	}

	// Token accounting (fire-and-forget).
	logAIUsage({
		event,
		endpoint: 'marketing/generate',
		model: result.model,
		inputTokens: result.inputTokens,
		outputTokens: result.outputTokens,
		organizationId,
		metadata: {
			card_type: rec.card_type,
			recommendation_id: recommendationId,
			prompt_version: result.promptVersion,
			retried: result.retried,
			warnings: result.warnings,
		},
	}).catch(() => {});
	deductOrgTokens(organizationId, result.inputTokens + result.outputTokens).catch(() => {});

	// Flip recommendation to drafted (best-effort — drafted state is recoverable).
	try {
		await directus.request(
			updateItem('marketing_recommendations', recommendationId, { status: 'drafted' }),
		);
	} catch (err: any) {
		console.warn('[marketing/generate] status update failed:', err.message);
	}

	return {
		...result.draft,
		_meta: {
			model: result.model,
			prompt_versions: { generator: result.promptVersion },
			retried: result.retried,
			warnings: result.warnings,
			duration_ms: result.durationMs,
			input_tokens: result.inputTokens,
			output_tokens: result.outputTokens,
		},
	};
});
