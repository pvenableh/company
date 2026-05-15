// scripts/end-stuck-meetings.ts
/**
 * Flip every video_meeting that's still marked `in_progress` past its
 * `scheduled_end` (or `scheduled_start + duration_minutes`) into `completed`.
 *
 * Daily's webhook should do this automatically — when it misses (HMAC unset,
 * tab-close before Daily flushed, dropped retry) the row sits forever. The
 * /meeting/[id] manual "End meeting" button handles the one-off case; this
 * script is the bulk recovery path.
 *
 * Dry run: `tsx scripts/end-stuck-meetings.ts`
 * Commit:  `tsx scripts/end-stuck-meetings.ts --apply`
 */

import { createDirectus, rest, staticToken, readItems, updateItem } from '@directus/sdk';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://admin.earnest.guru';
const DIRECTUS_TOKEN = process.env.DIRECTUS_SERVER_TOKEN || process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_TOKEN) {
	console.error('DIRECTUS_SERVER_TOKEN (or DIRECTUS_TOKEN) not set');
	process.exit(1);
}

const apply = process.argv.includes('--apply');
const directus = createDirectus(DIRECTUS_URL).with(rest()).with(staticToken(DIRECTUS_TOKEN));

interface MeetingRow {
	id: string;
	title?: string | null;
	status?: string | null;
	scheduled_start?: string | null;
	scheduled_end?: string | null;
	duration_minutes?: number | null;
	actual_start?: string | null;
}

async function main() {
	const rows = (await directus.request(
		readItems('video_meetings', {
			filter: { status: { _eq: 'in_progress' } },
			fields: [
				'id', 'title', 'status',
				'scheduled_start', 'scheduled_end', 'duration_minutes', 'actual_start',
			] as any,
			limit: 500,
			sort: ['-scheduled_start'],
		}),
	)) as MeetingRow[];

	const now = Date.now();
	const stuck = rows.filter((r) => {
		const end = r.scheduled_end
			? new Date(r.scheduled_end).getTime()
			: r.scheduled_start
				? new Date(r.scheduled_start).getTime() + ((r.duration_minutes || 30) * 60_000)
				: null;
		if (end === null) return false;
		// Give Daily 30 minutes of slack to fire its webhook.
		return now - end > 30 * 60_000;
	});

	console.log(`Found ${rows.length} in_progress meetings; ${stuck.length} are stuck past their end time.`);

	if (!stuck.length) {
		console.log('Nothing to do.');
		return;
	}

	for (const r of stuck) {
		const label = `${r.id}  ${r.title || '(untitled)'}  end=${r.scheduled_end || `(start+${r.duration_minutes}m)`}`;
		if (!apply) {
			console.log(`  DRY RUN — would complete: ${label}`);
			continue;
		}
		try {
			const startTime = r.actual_start || r.scheduled_start || null;
			const minutes = startTime
				? Math.max(0, Math.round((now - new Date(startTime).getTime()) / 60_000))
				: r.duration_minutes || null;
			await directus.request(
				updateItem('video_meetings', r.id, {
					status: 'completed',
					actual_end: new Date(now).toISOString(),
					...(minutes ? { actual_duration_minutes: minutes } : {}),
				} as any),
			);
			console.log(`  COMPLETED: ${label}`);
		} catch (err: any) {
			console.error(`  FAILED ${r.id}:`, err?.message || err);
		}
	}

	console.log(apply ? 'Done.' : '\nRun again with --apply to commit.');
}

main().catch((err) => {
	console.error('FATAL:', err);
	process.exit(1);
});
