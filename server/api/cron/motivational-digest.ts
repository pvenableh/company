/**
 * Motivational digest cron — the user-level "here's your day" email.
 *
 * Runs HOURLY (see vercel.json). Each run, it finds every subscriber whose
 * chosen LOCAL send-hour matches the current hour in their timezone and whose
 * cadence fires today (daily / weekdays / weekly-Mon), then either:
 *   - enqueues a `motivational-digest` job for the external earnest-worker to
 *     compose AI copy (when NUXT_DIGEST_USE_WORKER=true and a queue exists), or
 *   - sends the deterministic branded email directly (the default, so the
 *     feature works before the worker handler ships).
 *
 * Auth: `cronSecret` Bearer (Vercel Cron) — same convention as project-digests.
 * Manual triggers require owner/admin. Supports ?dryRun=true.
 *
 * Idempotency: a stable jobId / send-key of `motivational-digest-<user>-<date>`
 * keeps a re-run within the same local day from double-sending.
 */

import { readItems, readUsers } from '@directus/sdk';
import { getAIQueue } from '~~/server/utils/queue';
import { buildDigestPayload } from '~~/server/utils/motivational-digest';
import { sendMotivationalDigest } from '~~/server/utils/motivational-digest-email';
import {
	shouldSendDigestNow,
	clampHour,
	DEFAULT_DIGEST_CADENCE,
	DEFAULT_DIGEST_HOUR,
	DEFAULT_DIGEST_SECTIONS,
	type DigestCadence,
} from '~~/shared/digest';

interface PrefRow {
	user: string | { id: string };
	organization?: string | { id: string } | null;
	motivational_digest_enabled?: boolean | null;
	motivational_digest_cadence?: string | null;
	motivational_digest_hour?: number | null;
	motivational_digest_sections?: string[] | null;
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
		if (!(session as any).user?.id) throw createError({ statusCode: 401, message: 'Authentication required' });
		try {
			await requireOrgRole(event, ['owner', 'admin']);
		} catch {
			throw createError({ statusCode: 403, message: 'Manual trigger requires owner/admin role' });
		}
	}

	const queryDryRun = getQuery(event)?.dryRun;
	const bodyDryRun = method === 'POST' ? (await readBody(event).catch(() => ({})) as any)?.dryRun : undefined;
	const dryRun = queryDryRun === 'true' || queryDryRun === true || bodyDryRun === true || bodyDryRun === 'true';

	const useWorker = String((config as any).digestUseWorker ?? process.env.NUXT_DIGEST_USE_WORKER ?? '') === 'true';
	const aiEnabled = String((config as any).digestAi ?? process.env.NUXT_DIGEST_AI ?? '') === 'true';
	const appUrl = (config.public as any)?.appUrl || 'https://app.earnest.guru';
	const now = new Date();
	const directus = getServerDirectus();

	// All opted-in subscribers in one round-trip.
	const prefs = await directus.request(
		readItems('ai_preferences' as any, {
			filter: { motivational_digest_enabled: { _eq: true } } as any,
			fields: ['user', 'organization', 'motivational_digest_enabled', 'motivational_digest_cadence', 'motivational_digest_hour', 'motivational_digest_sections'] as any,
			limit: -1,
		}),
	).catch((e: any) => { console.warn('[cron/motivational-digest] pref read failed:', e?.message); return []; }) as PrefRow[];

	// Resolve which subscribers are due right now (in their own timezone).
	const due: Array<{ userId: string; orgId: string | null; cadence: DigestCadence; sections: string[]; tone: 'motivational' | 'forward' | 'wins' }> = [];
	const userIds = new Set<string>();
	for (const p of prefs) {
		const userId = typeof p.user === 'object' ? p.user?.id : p.user;
		if (!userId) continue;
		userIds.add(userId);
	}

	// Pull the timezone/name/email for every candidate user (core collection →
	// must go through readUsers, not item commands).
	const users = userIds.size
		? await directus.request(
			readUsers({
				filter: { id: { _in: Array.from(userIds) } } as any,
				fields: ['id', 'email', 'first_name', 'last_name', 'timezone'] as any,
				limit: -1,
			}),
		).catch(() => [] as any[]) as any[]
		: [];
	const userById = new Map(users.map((u) => [u.id, u]));

	for (const p of prefs) {
		const userId = typeof p.user === 'object' ? p.user?.id : p.user;
		if (!userId) continue;
		const u = userById.get(userId);
		if (!u?.email) continue;

		const cadence = (p.motivational_digest_cadence as DigestCadence) || DEFAULT_DIGEST_CADENCE;
		const sendHour = clampHour(p.motivational_digest_hour ?? DEFAULT_DIGEST_HOUR);
		const { send, tone } = shouldSendDigestNow({ cadence, sendHour, timezone: u.timezone, now });
		if (!send) continue;

		const orgId = (typeof p.organization === 'object' ? p.organization?.id : p.organization) || null;
		const sections = Array.isArray(p.motivational_digest_sections) && p.motivational_digest_sections.length
			? p.motivational_digest_sections
			: DEFAULT_DIGEST_SECTIONS;
		due.push({ userId, orgId, cadence, sections, tone });
	}

	const dateKey = now.toISOString().slice(0, 10);
	const queue = useWorker ? getAIQueue() : null;
	let sent = 0, enqueued = 0, skipped = 0;
	const notes: Array<{ userId: string; result: string }> = [];

	for (const d of due) {
		if (!d.orgId) { skipped++; notes.push({ userId: d.userId, result: 'no-org' }); continue; }
		if (dryRun) { notes.push({ userId: d.userId, result: 'dry-run-would-send' }); continue; }

		try {
			if (useWorker && queue) {
				// Hand the structured payload params to the worker; it composes AI copy.
				await queue.add('motivational-digest', {
					type: 'motivational-digest',
					userId: d.userId,
					organizationId: d.orgId,
					tone: d.tone,
					sections: d.sections,
					digestDate: dateKey,
				}, { jobId: `motivational-digest-${d.userId}-${dateKey}` });
				enqueued++;
				notes.push({ userId: d.userId, result: 'enqueued' });
				continue;
			}

			// Direct-send fallback.
			const u = userById.get(d.userId);
			const payload = await buildDigestPayload({
				directus, userId: d.userId, orgId: d.orgId, tone: d.tone, sections: d.sections, now,
			});
			if (!payload.hasContent) { skipped++; notes.push({ userId: d.userId, result: 'no-content' }); continue; }
			const res = await sendMotivationalDigest({
				to: u.email,
				firstName: u.first_name,
				payload,
				orgId: d.orgId,
				appUrl,
				ai: aiEnabled,
			});
			if (res.sent) { sent++; notes.push({ userId: d.userId, result: 'sent' }); }
			else { skipped++; notes.push({ userId: d.userId, result: `send-failed:${res.reason || 'unknown'}` }); }
		} catch (err: any) {
			skipped++;
			notes.push({ userId: d.userId, result: `error:${err?.message || 'unknown'}` });
		}
	}

	console.log(`[cron/motivational-digest] ${dryRun ? 'DRY-RUN ' : ''}candidates=${prefs.length} due=${due.length} sent=${sent} enqueued=${enqueued} skipped=${skipped} worker=${useWorker}`);

	return { ok: true, dryRun, mode: useWorker ? 'worker' : 'direct', candidates: prefs.length, due: due.length, sent, enqueued, skipped, notes };
});
