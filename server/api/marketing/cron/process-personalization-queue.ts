/**
 * Personalization-queue worker cron.
 *
 * Picks up `pending` rows from marketing_touch_variants and runs the
 * personalize generator against each. Groups rows by parent touch so
 * Anthropic prompt caching gets reused across recipients within the
 * same tick.
 *
 * ────────────────────────────────────────────────────────────────────
 * SAFETY
 * ────────────────────────────────────────────────────────────────────
 * Defaults to dry-run unless MARKETING_PERSONALIZE_DRY_RUN=false.
 * Dry-run still writes variants — but the content is deterministic
 * `{{first_name}}` substitution of the base, no AI tokens spent.
 * Flip the env var to arm real generation.
 * ────────────────────────────────────────────────────────────────────
 *
 * Auth: cronSecret bearer OR admin user session.
 * Method: GET (Vercel Cron) or POST (manual).
 * Body (POST):
 *   { dryRun?: boolean, batchSize?: number, organizationId?: string }
 *
 * Concurrency: PER_TICK_BATCH rows total per invocation (default 25),
 * processed sequentially per touch to maximize cache reuse. Multiple
 * touches in one tick run sequentially — adding cross-touch parallelism
 * gains little (different touches = different cache keys).
 */
import { readItem, readItems, updateItem } from '@directus/sdk';
import type { H3Event } from 'h3';
import { enforceTokenLimits, deductOrgTokens } from '~~/server/utils/ai-token-enforcement';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { buildPerContactContext } from '~~/server/utils/marketing-facts/build-personalize-context';
import { runPersonalizeTouch } from '~~/server/utils/marketing-generators/personalize-touch';
import { getResolvedVoice } from '~~/server/utils/marketing-generators/dormant-clients';
import type { MarketingTouchVariant } from '~~/shared/marketing-persistence';

interface CronBody {
	dryRun?: boolean;
	batchSize?: number;
	organizationId?: string;
}

const DEFAULT_BATCH = 25;
const STALE_PROCESSING_MS = 60 * 1000; // reclaim a `processing` row if claimed >60s ago

interface VariantWithTouch {
	id: number;
	touch: number;
	contact: string;
	organization: string;
	status: string;
	processing_started_at: string | null;
}

export default defineEventHandler(async (event) => {
	const method = getMethod(event);
	const body = method === 'POST' ? ((await readBody<CronBody>(event).catch(() => ({}))) || {}) : {};

	// Auth.
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

	const armedByEnv = process.env.MARKETING_PERSONALIZE_DRY_RUN === 'false';
	const dryRun = body.dryRun !== undefined ? !!body.dryRun : !armedByEnv;
	const batchSize = Math.max(1, Math.min(100, body.batchSize ?? DEFAULT_BATCH));

	const directus = getTypedDirectus();
	const now = new Date();
	const staleCutoff = new Date(now.getTime() - STALE_PROCESSING_MS).toISOString();

	const filter: any = {
		_or: [
			{ status: { _eq: 'pending' } },
			{
				_and: [
					{ status: { _eq: 'processing' } },
					{ processing_started_at: { _lt: staleCutoff } },
				],
			},
			// Rows in `processing` with NULL timestamp are also reclaimable
			// (worker died before stamping the timestamp).
			{
				_and: [
					{ status: { _eq: 'processing' } },
					{ processing_started_at: { _null: true } },
				],
			},
		],
	};
	if (body.organizationId) {
		filter._and = [{ organization: { _eq: body.organizationId } }];
	}

	let variants: VariantWithTouch[] = [];
	try {
		variants = await directus.request(
			readItems('marketing_touch_variants', {
				filter,
				fields: ['id', 'touch', 'contact', 'organization', 'status', 'processing_started_at'],
				sort: ['date_created'],
				limit: batchSize,
			}),
		) as VariantWithTouch[];
	} catch (err: any) {
		console.error('[personalize-cron] queue query failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to query personalization queue' });
	}

	if (variants.length === 0) {
		return {
			dryRun,
			batchSize,
			processed: 0,
			completed: 0,
			failed: 0,
			by_touch: [],
		};
	}

	// Group by touch.
	const byTouch = new Map<number, VariantWithTouch[]>();
	for (const v of variants) {
		const arr = byTouch.get(v.touch) || [];
		arr.push(v);
		byTouch.set(v.touch, arr);
	}

	const summary: Array<{ touch_id: number; processed: number; completed: number; failed: number }> = [];
	let totalCompleted = 0;
	let totalFailed = 0;

	for (const [touchId, rows] of byTouch.entries()) {
		const result = await processTouchBatch({
			event,
			directus,
			touchId,
			rows,
			dryRun,
		});
		totalCompleted += result.completed;
		totalFailed += result.failed;
		summary.push({ touch_id: touchId, processed: rows.length, completed: result.completed, failed: result.failed });

		// Bookkeep parent touch.personalization_state once this batch's touch is done.
		await maybeAdvanceTouchState(directus, touchId);
	}

	return {
		dryRun,
		batchSize,
		processed: variants.length,
		completed: totalCompleted,
		failed: totalFailed,
		by_touch: summary,
	};
});

async function processTouchBatch(args: {
	event: H3Event;
	directus: any;
	touchId: number;
	rows: VariantWithTouch[];
	dryRun: boolean;
}): Promise<{ completed: number; failed: number }> {
	const { event, directus, touchId, rows, dryRun } = args;

	// Load shared per-touch state once.
	let touchRow: any;
	try {
		touchRow = await directus.request(
			readItem('marketing_touches', touchId, {
				fields: [
					'id',
					'organization',
					'kind',
					'status',
					'email_subject',
					'email_preview_text',
					'email_body_markdown',
					'email_cta',
					'campaign',
				],
			}),
		);
	} catch (err: any) {
		console.error(`[personalize-cron] touch ${touchId} load failed:`, err.message);
		await markRowsFailed(directus, rows, `Parent touch load failed: ${err.message}`);
		return { completed: 0, failed: rows.length };
	}

	if (!touchRow) {
		await markRowsFailed(directus, rows, 'Parent touch not found');
		return { completed: 0, failed: rows.length };
	}
	if (touchRow.kind !== 'email') {
		await markRowsFailed(directus, rows, `Touch is kind=${touchRow.kind}; only email is supported`);
		return { completed: 0, failed: rows.length };
	}
	if (!['pending', 'scheduled'].includes(touchRow.status)) {
		// Touch was sent/cancelled out from under us — drop the queue work silently.
		await markRowsFailed(directus, rows, `Touch is ${touchRow.status}; no longer eligible`);
		return { completed: 0, failed: rows.length };
	}

	const organizationId: string = touchRow.organization;

	// Org-level token gate: if the org is over its limit, bail without
	// burning rows — leave them pending so the next tick (after limit reset
	// or top-up) picks them back up.
	if (!dryRun) {
		const tokenCheck = await enforceTokenLimits(event, organizationId).catch(() => ({ allowed: true } as any));
		if (!tokenCheck.allowed) {
			console.warn(`[personalize-cron] org ${organizationId} over token limit; deferring ${rows.length} rows`);
			return { completed: 0, failed: 0 };
		}
	}

	// Org metadata (one-shot per touch).
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
	const base = {
		subject: touchRow.email_subject || '',
		preview_text: touchRow.email_preview_text || '',
		body_markdown: touchRow.email_body_markdown || '',
		cta: touchRow.email_cta || 'reply',
	};

	let completed = 0;
	let failed = 0;

	for (const variant of rows) {
		// Claim the row — set status=processing + timestamp. If the update
		// affects 0 rows (someone else claimed it), skip.
		try {
			await directus.request(
				updateItem('marketing_touch_variants', variant.id, {
					status: 'processing',
					processing_started_at: new Date().toISOString(),
				}),
			);
		} catch (err: any) {
			console.warn(`[personalize-cron] failed to claim variant ${variant.id}:`, err.message);
			continue;
		}

		// Build per-contact context.
		const ctx = await buildPerContactContext({
			organizationId,
			contactId: variant.contact,
		}).catch((err) => {
			console.warn(`[personalize-cron] context build failed for ${variant.contact}:`, err.message);
			return null;
		});

		if (!ctx) {
			await markVariantFailed(directus, variant.id, 'Could not load contact context');
			failed++;
			continue;
		}

		try {
			const result = await runPersonalizeTouch({
				organizationId,
				orgName,
				orgIndustry,
				voice,
				base,
				contactContext: ctx,
				dryRun,
			});

			await directus.request(
				updateItem('marketing_touch_variants', variant.id, {
					status: 'completed',
					email_subject: result.subject,
					email_preview_text: result.preview_text,
					email_body_markdown: result.body_markdown,
					tokens_spent: result.inputTokens + result.outputTokens,
					prompt_version: result.promptVersion,
					generated_at: new Date().toISOString(),
					context_used: {
						signals_used: result.personalization_signals_used,
						has_notes: !!ctx.notes_excerpt,
						has_last_project: !!ctx.last_project,
						has_open_lead: !!ctx.open_lead,
						days_since_last_engagement: ctx.days_since_last_engagement,
						dry_run: result.dryRun,
					},
					error_message: null,
				}),
			);

			if (!result.dryRun && result.inputTokens + result.outputTokens > 0) {
				logAIUsage({
					event,
					endpoint: 'marketing/cron/personalize',
					model: result.model,
					inputTokens: result.inputTokens,
					outputTokens: result.outputTokens,
					organizationId,
					metadata: {
						touch_id: touchId,
						contact_id: variant.contact,
						prompt_version: result.promptVersion,
						retried: result.retried,
					},
				}).catch(() => {});
				deductOrgTokens(organizationId, result.inputTokens + result.outputTokens).catch(() => {});
			}

			completed++;
		} catch (err: any) {
			console.error(`[personalize-cron] variant ${variant.id} failed:`, err.message);
			await markVariantFailed(directus, variant.id, err.message || 'Unknown generator error');
			failed++;
		}
	}

	return { completed, failed };
}

async function markVariantFailed(directus: any, variantId: number, reason: string): Promise<void> {
	try {
		await directus.request(
			updateItem('marketing_touch_variants', variantId, {
				status: 'failed',
				error_message: reason.slice(0, 1000),
				processing_started_at: null,
			}),
		);
	} catch (err: any) {
		console.warn(`[personalize-cron] failed to mark ${variantId} failed:`, err.message);
	}
}

async function markRowsFailed(directus: any, rows: VariantWithTouch[], reason: string): Promise<void> {
	for (const r of rows) {
		await markVariantFailed(directus, r.id, reason);
	}
}

async function maybeAdvanceTouchState(directus: any, touchId: number): Promise<void> {
	try {
		const remaining = await directus.request(
			readItems('marketing_touch_variants', {
				filter: {
					_and: [
						{ touch: { _eq: touchId } },
						{ status: { _in: ['pending', 'processing'] as any } },
					],
				},
				fields: ['id'],
				limit: 1,
			}),
		) as any[];
		if (remaining.length === 0) {
			await directus.request(
				updateItem('marketing_touches', touchId, { personalization_state: 'completed' }),
			);
		}
	} catch (err: any) {
		console.warn(`[personalize-cron] state advance for touch ${touchId} failed:`, err.message);
	}
}
