/**
 * Refresh marketing-feed recommendations.
 *
 * Vercel Cron (or admin-triggered): run all signal extractors per active
 * org, run the deterministic ranker, write the top 3 candidates per org
 * to marketing_recommendations with status=pending and a 7-day expiry.
 *
 * Auth: cronSecret Bearer token OR admin user session
 * Method: GET (Vercel Cron) or POST
 * Body (POST):
 *   {
 *     organizationId?: string,  // limit to one org
 *     dryRun?: boolean,         // default true; set false to actually write
 *   }
 *
 * Default behavior (no body, no flags) is a DRY RUN. The cron entry in
 * vercel.json sends `MARKETING_REFRESH_DRY_RUN=false` via env to arm it
 * for production once you're ready — see vercel.json.
 *
 * Idempotency: at write time, prior rows with the same ranker_run_id are
 * deleted before re-creating, so the same week's run is replayable.
 *
 * Also: expires any existing pending|drafted rows whose expires_at < now.
 */
import { createItem, deleteItem, readItems, updateItem } from '@directus/sdk';
import { extractDormantClientsCandidates } from '~~/server/utils/marketing-signals/dormant-clients';
import { extractProjectCompleteCandidates } from '~~/server/utils/marketing-signals/project-complete';
import { extractLeadReengagementCandidates } from '~~/server/utils/marketing-signals/lead-reengagement';
import { extractReferralAskCandidates } from '~~/server/utils/marketing-signals/referral-ask';
import { selectTopN, RANKER_PROMPT_VERSION } from '~~/server/utils/marketing-ranker/select';
import { enrichRankedWhyNow, RANKER_LLM_VERSION } from '~~/server/utils/marketing-ranker/enrich';
import type { RecommendationCandidate } from '~~/server/utils/marketing-signals/types';

interface RefreshBody {
	organizationId?: string;
	dryRun?: boolean;
}

const SEVEN_DAYS_MS = 1000 * 60 * 60 * 24 * 7;

function thisWeekRunId(): string {
	const now = new Date();
	const y = now.getUTCFullYear();
	// ISO week-of-year (rough): days-since-jan-1 / 7.
	const jan1 = new Date(Date.UTC(y, 0, 1));
	const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);
	return `cron-${y}-w${String(week).padStart(2, '0')}`;
}

async function expireOldRecommendations(directus: any): Promise<number> {
	const nowIso = new Date().toISOString();
	try {
		const stale = await directus.request(
			readItems('marketing_recommendations', {
				filter: {
					_and: [
						{ status: { _in: ['pending', 'drafted'] } },
						{ expires_at: { _lt: nowIso } },
					],
				},
				fields: ['id'],
				limit: 500,
			}),
		) as any[];
		if (!stale.length) return 0;
		await Promise.all(
			stale.map((r) =>
				directus.request(updateItem('marketing_recommendations', r.id, { status: 'expired' })).catch(() => null),
			),
		);
		return stale.length;
	} catch (err: any) {
		console.warn('[marketing/cron] expire pass failed:', err.message);
		return 0;
	}
}

async function deletePriorRunRows(directus: any, organizationId: string, runId: string): Promise<number> {
	try {
		const rows = await directus.request(
			readItems('marketing_recommendations', {
				filter: {
					_and: [
						{ organization: { _eq: organizationId } },
						{ ranker_run_id: { _eq: runId } },
					],
				},
				fields: ['id'],
				limit: 100,
			}),
		) as any[];
		if (!rows.length) return 0;
		await Promise.all(
			rows.map((r) => directus.request(deleteItem('marketing_recommendations', r.id)).catch(() => null)),
		);
		return rows.length;
	} catch (err: any) {
		console.warn('[marketing/cron] prior-run delete failed:', err.message);
		return 0;
	}
}

async function runForOrg(args: {
	directus: any;
	organizationId: string;
	runId: string;
	dryRun: boolean;
}): Promise<{
	organizationId: string;
	candidates: number;
	selected: number;
	written: number;
	deleted: number;
	dryRun: boolean;
	picks: Array<{ card_type: string; why_now: string; urgency: number }>;
}> {
	const { directus, organizationId, runId, dryRun } = args;

	const [dormant, projectComplete, leadReengagement, referralAsk] = await Promise.all([
		extractDormantClientsCandidates(organizationId).catch((e: any) => {
			console.warn('[marketing/cron] dormant extractor failed:', e.message);
			return [] as RecommendationCandidate[];
		}),
		extractProjectCompleteCandidates(organizationId).catch((e: any) => {
			console.warn('[marketing/cron] project_complete extractor failed:', e.message);
			return [] as RecommendationCandidate[];
		}),
		extractLeadReengagementCandidates(organizationId).catch((e: any) => {
			console.warn('[marketing/cron] lead_reengagement extractor failed:', e.message);
			return [] as RecommendationCandidate[];
		}),
		extractReferralAskCandidates(organizationId).catch((e: any) => {
			console.warn('[marketing/cron] referral_ask extractor failed:', e.message);
			return [] as RecommendationCandidate[];
		}),
	]);

	const all: RecommendationCandidate[] = [...dormant, ...projectComplete, ...leadReengagement, ...referralAsk];
	const ranked = selectTopN({ candidates: all, runId, promptVersion: RANKER_PROMPT_VERSION });
	// LLM ranker pass: sharpen each pick's why_now (opportunity-framed, grounded)
	// + refine urgency. Best-effort — falls back to the deterministic hook.
	await enrichRankedWhyNow(ranked);

	const picks = ranked.map((r) => ({
		card_type: r.candidate.card_type,
		why_now: r.rankerOutput.why_now,
		urgency: r.rankerOutput.urgency,
	}));

	if (dryRun) {
		return {
			organizationId,
			candidates: all.length,
			selected: ranked.length,
			written: 0,
			deleted: 0,
			dryRun: true,
			picks,
		};
	}

	const deleted = await deletePriorRunRows(directus, organizationId, runId);

	const surfaced = new Date().toISOString();
	const expires = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();

	let written = 0;
	for (const r of ranked) {
		const c = r.candidate;
		try {
			await directus.request(
				createItem('marketing_recommendations', {
					organization: organizationId,
					card_type: c.card_type,
					status: 'pending',
					urgency: r.rankerOutput.urgency,
					candidate_data: c.candidate_data,
					ranker_output: r.rankerOutput,
					ranker_run_id: runId,
					ranker_prompt_version: RANKER_LLM_VERSION,
					surfaced_at: surfaced,
					expires_at: expires,
				}),
			);
			written++;
		} catch (err: any) {
			console.error('[marketing/cron] insert failed:', err.message);
		}
	}

	return {
		organizationId,
		candidates: all.length,
		selected: ranked.length,
		written,
		deleted,
		dryRun: false,
		picks,
	};
}

export default defineEventHandler(async (event) => {
	const method = getMethod(event);
	const body = method === 'POST' ? ((await readBody<RefreshBody>(event).catch(() => ({}))) || {}) : {};

	// Auth: cronSecret bearer OR admin user session.
	const authHeader = getHeader(event, 'authorization');
	const config = useRuntimeConfig();
	const cronSecret = (config as any).cronSecret || (config.public as any)?.cronSecret;
	if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
		// authenticated as cron
	} else {
		const session = await requireUserSession(event);
		const userId = (session as any).user?.id;
		if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	// Default to dry run unless explicitly armed via env or body.
	const armedByEnv = process.env.MARKETING_REFRESH_DRY_RUN === 'false';
	const dryRun = body.dryRun !== undefined ? !!body.dryRun : !armedByEnv;

	const directus = getTypedDirectus();
	const runId = thisWeekRunId();

	// Resolve target orgs.
	let orgIds: string[] = [];
	if (body.organizationId) {
		orgIds = [body.organizationId];
	} else {
		try {
			const orgs = await directus.request(
				readItems('organizations', {
					filter: {
						_and: [
							{ active: { _eq: true } },
							{ archived_at: { _null: true } },
						],
					},
					fields: ['id'],
					limit: 500,
				}),
			) as any[];
			orgIds = orgs.map((o: any) => o.id);
		} catch (err: any) {
			console.error('[marketing/cron] fetch orgs failed:', err.message);
			throw createError({ statusCode: 500, message: 'Failed to fetch organizations' });
		}
	}

	// Expire pass first (cheap, runs even on dry run).
	const expired = await expireOldRecommendations(directus);

	const results: Awaited<ReturnType<typeof runForOrg>>[] = [];
	for (const id of orgIds) {
		// Sequential to keep DB load + Directus rate limits predictable.
		results.push(await runForOrg({ directus, organizationId: id, runId, dryRun }));
	}

	const totals = results.reduce(
		(acc, r) => ({
			candidates: acc.candidates + r.candidates,
			selected: acc.selected + r.selected,
			written: acc.written + r.written,
			deleted: acc.deleted + r.deleted,
		}),
		{ candidates: 0, selected: 0, written: 0, deleted: 0 },
	);

	return {
		runId,
		dryRun,
		expiredOldRows: expired,
		organizations: orgIds.length,
		totals,
		perOrg: results,
	};
});
