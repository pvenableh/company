/**
 * Send-due-touches cron.
 *
 * Fires marketing_touches whose scheduled_for window has arrived. For
 * each due touch, calls fireDueTouch() which resolves audience and
 * either sends via SendGrid (email) or creates a row in social_posts
 * (social — picked up by the existing social publisher).
 *
 * ────────────────────────────────────────────────────────────────────
 * SAFETY — READ THIS BEFORE ARMING
 * ────────────────────────────────────────────────────────────────────
 * This route is NOT in vercel.json on purpose. Wiring it up means real
 * emails will start firing to real contacts in the audience snapshot.
 * Before adding the cron entry:
 *
 *   1. Verify a few campaigns end-to-end with `dryRun: true` (default).
 *   2. Check that the audience-snapshot contact_ids on those campaigns
 *      point to real opted-in recipients.
 *   3. Confirm SendGrid `from` address authentication is set up.
 *   4. Set env MARKETING_SEND_DRY_RUN=false to arm the route.
 *   5. Add a vercel.json entry like:
 *      { "path": "/api/marketing/cron/send-due-touches",
 *        "schedule": "0,15,30,45 * * * *" }
 *
 * Defaults: dry-run, looks back 1 hour from now (catches touches that
 * just hit their scheduled_for plus any from the previous tick).
 * ────────────────────────────────────────────────────────────────────
 *
 * Auth: cronSecret bearer OR admin user session.
 * Method: GET (Vercel Cron) or POST (manual).
 * Body (POST):
 *   { dryRun?: boolean, lookbackMinutes?: number, organizationId?: string }
 */
import { readItems } from '@directus/sdk';
import { fireDueTouch, type SendTouchResult } from '~~/server/utils/marketing-send';

interface SendBody {
	dryRun?: boolean;
	lookbackMinutes?: number;
	organizationId?: string;
}

export default defineEventHandler(async (event) => {
	const method = getMethod(event);
	const body = method === 'POST' ? ((await readBody<SendBody>(event).catch(() => ({}))) || {}) : {};

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

	// Default to dry-run unless explicitly armed via env or body.
	const armedByEnv = process.env.MARKETING_SEND_DRY_RUN === 'false';
	const dryRun = body.dryRun !== undefined ? !!body.dryRun : !armedByEnv;
	const lookbackMinutes = body.lookbackMinutes ?? 60;

	const directus = getTypedDirectus();
	const now = new Date();
	const windowStart = new Date(now.getTime() - lookbackMinutes * 60 * 1000).toISOString();
	const nowIso = now.toISOString();

	const filter: any = {
		_and: [
			{ status: { _eq: 'scheduled' } },
			{ scheduled_for: { _lte: nowIso } },
			{ scheduled_for: { _gt: windowStart } },
		],
	};
	if (body.organizationId) {
		filter._and.push({ organization: { _eq: body.organizationId } });
	}

	let dueTouches: any[] = [];
	try {
		dueTouches = await directus.request(
			readItems('marketing_touches', {
				filter,
				fields: ['id'],
				sort: ['scheduled_for'],
				limit: 100,
			}),
		) as any[];
	} catch (err: any) {
		console.error('[marketing/send-due] query failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to query due touches' });
	}

	const results: SendTouchResult[] = [];
	for (const t of dueTouches) {
		results.push(await fireDueTouch({ touchId: t.id, dryRun }));
	}

	const summary = {
		dryRun,
		windowStart,
		windowEnd: nowIso,
		dueCount: dueTouches.length,
		sent: results.filter((r) => r.status === 'sent').length,
		dryRunPreviews: results.filter((r) => r.status === 'dry_run').length,
		skipped: results.filter((r) => r.status === 'skipped').length,
		failed: results.filter((r) => r.status === 'failed').length,
		results,
	};

	return summary;
});
