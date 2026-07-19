/**
 * Generate a marketing draft for a recommendation.
 *
 * POST /api/marketing/recommendations/[id]/generate
 *
 * Two paths:
 *   1. Cold call (rec.status='pending' OR rec lacks a resulting_campaign):
 *      Runs the Anthropic generator, deducts tokens, persists a marketing_campaigns
 *      row in status='draft' + N marketing_touches in status='pending', flips the
 *      recommendation to status='drafted' with resulting_campaign set, returns
 *      DraftedCampaign with persisted IDs.
 *
 *   2. Reload (rec.status='drafted' with a draft-state resulting_campaign):
 *      No AI call, no token spend. Loads the persisted campaign+touches and
 *      returns them in DraftedCampaign shape so the drawer can re-open the
 *      same draft cleanly. The "drafts auto-save" UX promise depends on this.
 *
 * The reload path makes per-touch regenerate (which mutates marketing_touches
 * directly) interoperate with re-opening the drawer — edits and regenerates
 * survive across drawer close/reopen until the user explicitly Discards or
 * Schedules.
 */
import { readItem, readItems, createItem, updateItem } from '@directus/sdk';
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
import {
	runReferralAskGenerator,
	type ReferralAskCandidate,
} from '~~/server/utils/marketing-generators/referral-ask';
import type { LeadReengagementCandidate } from '~~/server/utils/marketing-facts/build-lead-reengagement-facts';
import type { DraftedCampaign, DraftedTouch } from '~/composables/useMarketingDrafts';
import type { MarketingTouch } from '~~/shared/marketing-persistence';

function deriveTitleFromCardType(cardType: string, candidate: any): string {
	const data = candidate || {};
	const audienceSize = data?.audience?.size ?? 0;
	switch (cardType) {
		case 'dormant_clients':
			return `Reach out to ${audienceSize} dormant ${audienceSize === 1 ? 'client' : 'clients'}`;
		case 'project_complete': {
			const phase = data?.phase as string | undefined;
			const contact = data?.signal?.primary_contact_name as string | undefined;
			const project = data?.signal?.project_title as string | undefined;
			if (phase === 'request_testimonial' && contact) return `Ask ${contact} for a testimonial`;
			if (project) return `Turn ${project} into a campaign`;
			return 'Surface a recent win';
		}
		case 'lead_reengagement': {
			const topic = data?.cluster?.label as string | undefined;
			const count = data?.cluster?.size ?? audienceSize;
			if (topic) return `Re-engage ${count} ${topic.toLowerCase()} leads`;
			return `Re-engage ${count} quiet leads`;
		}
		case 'referral_ask': {
			const client = data?.signal?.client_name as string | undefined;
			return client ? `Ask ${client} for a referral` : 'Ask a happy client for a referral';
		}
		default:
			return 'Marketing action';
	}
}

function touchRowToDraftedTouch(row: MarketingTouch): DraftedTouch {
	return {
		id: row.id,
		kind: row.kind,
		send_offset_hours: row.send_offset_hours,
		audience_target: row.audience_target,
		audience_filter: row.audience_filter,
		email_subject: row.email_subject,
		email_preview_text: row.email_preview_text,
		email_body_markdown: row.email_body_markdown,
		email_cta: row.email_cta,
		social_channel: row.social_channel,
		social_caption: row.social_caption,
		social_image_brief: row.social_image_brief,
		regenerate_history: Array.isArray(row.regenerate_history)
			? (row.regenerate_history as DraftedTouch['regenerate_history'])
			: null,
	};
}

export default defineEventHandler(async (event) => {
	const idParam = getRouterParam(event, 'id');
	const recommendationId = idParam ? Number(idParam) : NaN;
	if (!Number.isFinite(recommendationId)) {
		throw createError({ statusCode: 400, message: 'Recommendation ID must be numeric' });
	}

	const directus = getTypedDirectus();

	const rec = await directus
		.request(
			readItem('marketing_recommendations', recommendationId, {
				fields: ['id', 'organization', 'card_type', 'status', 'candidate_data', 'resulting_campaign'],
			}),
		)
		.catch(() => null) as any;

	if (!rec) {
		throw createError({ statusCode: 404, message: 'Recommendation not found' });
	}
	if (!['pending', 'drafted'].includes(rec.status)) {
		throw createError({
			statusCode: 409,
			message: `Recommendation is ${rec.status}; cannot generate.`,
		});
	}

	const organizationId: string = rec.organization;
	await requireOrgMembership(event, organizationId);

	// ─── Reload path ────────────────────────────────────────────────────────
	// If a draft campaign already exists for this rec, return it without
	// running the AI again. Idempotent generate is what makes the "drafts
	// auto-save" promise work.
	if (rec.status === 'drafted' && rec.resulting_campaign) {
		const existing = await directus
			.request(
				readItem('marketing_campaigns', rec.resulting_campaign, {
					fields: [
						'id',
						'status',
						'generator_strategy',
						'cadence_rationale',
						'facts_used',
						'tokens_spent',
						'audience_snapshot',
					],
				}),
			)
			.catch(() => null) as any;

		if (existing && existing.status === 'draft') {
			const touchRows = await directus.request(
				readItems('marketing_touches', {
					filter: { campaign: { _eq: existing.id } },
					sort: ['sequence_index'],
					limit: -1,
				}),
			) as any[];

			const touches = touchRows.map(touchRowToDraftedTouch);
			const audienceSnapshot = existing.audience_snapshot || {};

			const draft: DraftedCampaign = {
				campaign_id: existing.id,
				touches,
				phase_strategy: existing.generator_strategy ?? null,
				cadence_rationale: existing.cadence_rationale ?? '',
				facts_used: Array.isArray(existing.facts_used)
					? existing.facts_used.map((id: string) => ({ id, label: id, kind: 'fact' }))
					: [],
				tokens_spent: existing.tokens_spent ?? 0,
				duration_ms: 0,
				voice_signals: ['reloaded from saved draft'],
				audience_summary: {
					size: Array.isArray(audienceSnapshot?.contact_ids) ? audienceSnapshot.contact_ids.length : 0,
					sample_names: Array.isArray(audienceSnapshot?.sample_names) ? audienceSnapshot.sample_names : [],
				},
			};

			return {
				...draft,
				_meta: { reloaded: true, prompt_versions: {} },
			};
		}
		// Otherwise (campaign got promoted/cancelled): fall through to fresh generate.
	}

	// ─── Cold-generate path ─────────────────────────────────────────────────

	// Token gate — block before spending API credits.
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
		// Non-fatal — fall back to defaults.
	}

	const voice = getResolvedVoice(organizationId);
	const candidateData = (rec.candidate_data || {}) as any;

	let result: {
		draft: DraftedCampaign;
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
			case 'referral_ask': {
				// Compact single-touch generator — no separate facts builder; it
				// grounds directly on the candidate's project/client signal.
				result = await runReferralAskGenerator({
					organizationId,
					orgName,
					orgIndustry,
					candidate: candidateData as ReferralAskCandidate,
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
	// Mocked demo sessions spend nothing — log usage but never deduct.
	if (!isDemoMockEvent(event)) {
		deductOrgTokens(organizationId, result.inputTokens + result.outputTokens).catch(() => {});
	}

	// ─── Persist draft campaign + touches ───────────────────────────────────
	const audienceData = candidateData?.audience || {};
	const clusterLabel = candidateData?.cluster?.label;
	let contactIds: string[] = Array.isArray(audienceData.contact_ids) ? audienceData.contact_ids : [];

	// Lead-reengagement clusters target leads, not contacts directly. If the
	// candidate didn't pre-resolve audience.contact_ids (older seeds, or
	// extractor rev that only emitted cluster.lead_ids), walk the leads here
	// so the personalization endpoint can find recipients.
	if (rec.card_type === 'lead_reengagement' && contactIds.length === 0) {
		const leadIds = Array.isArray(candidateData?.cluster?.lead_ids)
			? (candidateData.cluster.lead_ids as number[]).filter((x) => Number.isFinite(x))
			: [];
		if (leadIds.length > 0) {
			try {
				const leads = await directus.request(
					readItems('leads', {
						filter: { id: { _in: leadIds as any } },
						fields: ['id', 'related_contact'],
						limit: -1,
					}),
				) as any[];
				contactIds = Array.from(
					new Set(
						leads
							.map((l) => (typeof l.related_contact === 'string' ? l.related_contact : l.related_contact?.id))
							.filter((x): x is string => typeof x === 'string' && x.length > 0),
					),
				);
			} catch (err: any) {
				console.warn('[marketing/generate] lead→contact walk failed:', err.message);
			}
		}
	}

	const audienceSnapshot = {
		contact_ids: contactIds,
		cluster_label: clusterLabel,
		sample_names: Array.isArray(audienceData.sample_names) ? audienceData.sample_names : [],
		captured_at: new Date().toISOString(),
	};

	const title = deriveTitleFromCardType(rec.card_type, candidateData);

	let createdCampaign: any;
	try {
		createdCampaign = await directus.request(
			createItem('marketing_campaigns', {
				title,
				goal: null,
				status: 'draft',
				type: 'feed_recommendation',
				organization: organizationId,
				recommendation: recommendationId,
				card_type: rec.card_type,
				phase: candidateData?.phase || null,
				voice_fingerprint_snapshot: null,
				facts_used: (result.draft.facts_used || []).map((f) => f.id),
				prompt_versions: { generator: result.promptVersion },
				audience_snapshot: audienceSnapshot,
				tokens_spent: result.draft.tokens_spent ?? 0,
				generator_strategy: result.draft.phase_strategy ?? null,
				cadence_rationale: result.draft.cadence_rationale ?? null,
				start_date: null,
				end_date: null,
			}),
		);
	} catch (err: any) {
		console.error('[marketing/generate] campaign create failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to persist draft campaign' });
	}

	const campaignId = createdCampaign.id;
	const persistedTouches: DraftedTouch[] = [];
	try {
		for (let i = 0; i < result.draft.touches.length; i++) {
			const t = result.draft.touches[i]!;
			const created = await directus.request(
				createItem('marketing_touches', {
					campaign: campaignId,
					organization: organizationId,
					sequence_index: i,
					kind: t.kind,
					audience_target: t.audience_target,
					audience_filter: t.audience_filter || 'all',
					send_offset_hours: t.send_offset_hours,
					scheduled_for: null,
					status: 'pending',
					email_subject: t.email_subject,
					email_preview_text: t.email_preview_text,
					email_body_markdown: t.email_body_markdown,
					email_cta: t.email_cta,
					social_channel: t.social_channel,
					social_caption: t.social_caption,
					social_image_brief: t.social_image_brief,
					social_image_url: null,
					personalization_state: 'none',
					tokens_spent: 0,
					regenerate_history: null,
					generator_strategy_excerpt: result.draft.phase_strategy ?? null,
				}),
			) as any;
			persistedTouches.push({ ...t, id: created.id, regenerate_history: null });
		}
	} catch (err: any) {
		console.error('[marketing/generate] touch create failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to persist draft touches' });
	}

	// Flip rec to drafted with the campaign FK.
	try {
		await directus.request(
			updateItem('marketing_recommendations', recommendationId, {
				status: 'drafted',
				resulting_campaign: campaignId,
			}),
		);
	} catch (err: any) {
		console.warn('[marketing/generate] status update failed:', err.message);
	}

	const draftWithIds: DraftedCampaign = {
		...result.draft,
		campaign_id: campaignId,
		touches: persistedTouches,
	};

	return {
		...draftWithIds,
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
