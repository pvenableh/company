/**
 * Daily PM digest cron — fans out one BullMQ `digest-project` job per
 * (active project, eligible recipient).
 *
 * Auth: `cronSecret` Bearer header (Vercel Cron) — same convention as
 * /api/org/cleanup-archived. Manual triggers from an admin session also work.
 *
 * Eligibility:
 *   - Org must not be archived
 *   - Project status must not be 'completed' or 'Archived' (the real enum
 *     values on prod — see shared/directus.ts Project.status)
 *   - Project must have date_updated within the last 14 days
 *   - Recipient resolution order:
 *       1. project.user_created (the project's creator — typically the PM)
 *       2. org owner (from organizations_directus_users where role='owner')
 *   - Recipient's `ai_preferences.digest_cadence` must be 'daily', or
 *     'weekly' on Mondays
 *
 * Idempotent at the worker layer — a digest row already keyed
 * (project, digest_date, recipient) is a no-op.
 */

import { readItems } from '@directus/sdk';
import { getAIQueue } from '~~/server/utils/queue';

interface OrgRow { id: string; name?: string }
interface ProjectRow {
	id: string;
	title?: string;
	status?: string;
	organization?: string | { id: string };
	user_created?: string | { id: string } | null;
	date_updated?: string | null;
}
interface PrefRow { user: string | { id: string }; digest_cadence?: string }
interface MembershipRow { directus_users_id?: string | { id: string }; role?: string }

function todayIso(): string { return new Date().toISOString().slice(0, 10); }
function fourteenDaysAgoIso(): string {
	return new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
}

export default defineEventHandler(async (event) => {
	const method = getMethod(event);
	const config = useRuntimeConfig();
	const cronSecret = (config as any).cronSecret;
	const authHeader = getHeader(event, 'authorization');

	if (authHeader === `Bearer ${cronSecret}` && cronSecret) {
		// authenticated via cron secret
	} else {
		const session = await requireUserSession(event);
		const userId = (session as any).user?.id;
		if (!userId) {
			throw createError({ statusCode: 401, message: 'Authentication required' });
		}
		try {
			await requireOrgRole(event, ['owner', 'admin']);
		} catch {
			throw createError({ statusCode: 403, message: 'Manual trigger requires owner/admin role' });
		}
	}

	const queue = getAIQueue();
	if (!queue) {
		return { ok: false, reason: 'REDIS_QUEUE_URL not configured' };
	}

	// Accept dryRun via query string OR JSON body, on either GET or POST.
	// Vercel Cron fires GET; manual smoke-tests via curl typically POST.
	const queryDryRun = getQuery(event)?.dryRun;
	const bodyDryRun = method === 'POST'
		? (await readBody(event).catch(() => ({})) as any)?.dryRun
		: undefined;
	const dryRun = queryDryRun === 'true' || queryDryRun === true || bodyDryRun === true || bodyDryRun === 'true';

	const directus = getServerDirectus();
	const today = todayIso();
	const isMonday = new Date().getUTCDay() === 1;

	const orgs = await directus.request(
		readItems('organizations' as any, {
			filter: { archived_at: { _null: true } },
			fields: ['id', 'name'] as any,
			limit: -1,
		}),
	).catch(() => []) as OrgRow[];

	const since = fourteenDaysAgoIso();
	let totalEnqueued = 0;
	let totalSkipped = 0;
	const orgReports: Array<{ orgId: string; enqueued: number; skipped: number; skipReasons?: Array<{ projectId: string; reason: string; detail?: string }> }> = [];

	for (const org of orgs) {
		const projects = await directus.request(
			readItems('projects' as any, {
				filter: {
					_and: [
						{ organization: { _eq: org.id } },
						// Real enum on prod: 'Pending' | 'Scheduled' | 'In Progress' | 'completed' | 'Archived'
						{ status: { _nin: ['completed', 'Archived'] } },
						{ date_updated: { _gte: since } },
					],
				},
				fields: ['id', 'title', 'status', 'organization', 'user_created', 'date_updated'] as any,
				limit: -1,
			}),
		).catch(() => []) as ProjectRow[];

		if (!projects.length) {
			orgReports.push({ orgId: org.id, enqueued: 0, skipped: 0 });
			continue;
		}

		// Org owner — fallback when project.user_created can't be resolved.
		const ownerships = await directus.request(
			readItems('organizations_directus_users' as any, {
				filter: {
					_and: [
						{ organizations_id: { _eq: org.id } },
						{ role: { _eq: 'owner' } },
					],
				},
				fields: ['directus_users_id'] as any,
				limit: 1,
			}),
		).catch(() => []) as MembershipRow[];

		const ownerId = ownerships[0]?.directus_users_id
			? (typeof ownerships[0].directus_users_id === 'object'
				? ownerships[0].directus_users_id.id
				: ownerships[0].directus_users_id)
			: null;

		// Pre-fetch all candidate recipients' digest_cadence preferences in one round-trip.
		const recipientIds = Array.from(new Set(
			projects
				.map((p) => (typeof p.user_created === 'object' ? p.user_created?.id : p.user_created) || ownerId)
				.filter(Boolean) as string[],
		));

		const prefs = recipientIds.length > 0 ? await directus.request(
			readItems('ai_preferences' as any, {
				filter: { user: { _in: recipientIds } },
				fields: ['user', 'digest_cadence'] as any,
				limit: -1,
			}),
		).catch(() => []) as PrefRow[] : [];

		const cadenceByUser = new Map<string, string>();
		for (const p of prefs) {
			const uid = typeof p.user === 'object' ? p.user.id : p.user;
			if (uid) cadenceByUser.set(uid, p.digest_cadence || 'daily');
		}

		let enqueued = 0;
		let skipped = 0;
		const skipReasons: Array<{ projectId: string; reason: string; detail?: string }> = [];

		for (const project of projects) {
			const recipient = (typeof project.user_created === 'object' ? project.user_created?.id : project.user_created) || ownerId;
			if (!recipient) {
				skipped++;
				skipReasons.push({ projectId: project.id, reason: 'no-recipient', detail: `user_created=${JSON.stringify(project.user_created)} ownerId=${ownerId}` });
				continue;
			}

			const cadence = cadenceByUser.get(recipient) || 'daily';
			if (cadence === 'off') { skipped++; skipReasons.push({ projectId: project.id, reason: 'cadence-off', detail: recipient }); continue; }
			if (cadence === 'weekly' && !isMonday) { skipped++; skipReasons.push({ projectId: project.id, reason: 'weekly-not-monday', detail: recipient }); continue; }

			if (dryRun) { enqueued++; continue; }

			// Stable jobId for idempotency at the queue layer too — re-running the
			// cron same day shouldn't multiply jobs even if the worker hasn't
			// drained the previous batch yet.
			const jobId = `digest-${project.id}-${recipient}-${today}`;
			try {
				await queue.add(
					'digest-project',
					{
						type: 'digest-project',
						projectId: project.id,
						organizationId: org.id,
						recipientUserId: recipient,
						digestDate: today,
					},
					{ jobId },
				);
				enqueued++;
			} catch (err: any) {
				console.warn(`[cron/project-digests] enqueue failed project=${project.id}:`, err.message);
				skipped++;
				skipReasons.push({ projectId: project.id, reason: 'enqueue-threw', detail: err.message });
			}
		}

		totalEnqueued += enqueued;
		totalSkipped += skipped;
		orgReports.push({ orgId: org.id, enqueued, skipped, skipReasons });
	}

	console.log(`[cron/project-digests] ${dryRun ? 'DRY-RUN ' : ''}enqueued=${totalEnqueued} skipped=${totalSkipped} orgs=${orgs.length}`);

	return {
		ok: true,
		dryRun,
		date: today,
		isMonday,
		orgs: orgs.length,
		enqueued: totalEnqueued,
		skipped: totalSkipped,
		breakdown: orgReports,
	};
});
