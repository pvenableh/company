// server/api/ai/meeting-summary.post.ts
/**
 * Generate (or regenerate) the AI summary for a video meeting.
 *
 * The Daily transcript.ready-to-download webhook auto-triggers this for
 * meetings with stored transcripts; this endpoint exists for manual retries
 * and for meetings where someone clicks "Regenerate" on the recap page.
 */

import { readItem, readItems, updateItem } from '@directus/sdk';
import { generateAndSaveMeetingSummary } from '~~/server/utils/meeting-summary';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { fetchDailyTranscriptBody, getDailyTranscript, vttToPlainText } from '~~/server/utils/daily';

interface Body {
	meetingId?: string;
}

// Daily's transcript REST endpoint requires a transcript_id. When the
// webhook was missed, we can list transcripts for the room via the
// `/transcript` listing route. This is an undocumented but stable path
// that returns the same shape `transcript.ready-to-download` would have
// fired with. Best-effort — failure means the user has to wait for the
// webhook to retry.
async function fetchLatestTranscriptIdForRoom(roomName: string): Promise<string | null> {
	try {
		const apiKey = process.env.DAILY_API_KEY || (useRuntimeConfig() as any).dailyApiKey;
		if (!apiKey) return null;
		const url = `https://api.daily.co/v1/transcript?room_name=${encodeURIComponent(roomName)}&limit=10`;
		const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
		if (!res.ok) return null;
		const body = await res.json() as any;
		const list = (body?.data || []) as any[];
		const finished = list.find((t) => t?.status === 'finished');
		const candidate = finished || list[0];
		return candidate?.transcriptId || candidate?.id || null;
	} catch {
		return null;
	}
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) {
		throw createError({ statusCode: 401, message: 'Authentication required' });
	}

	const body = await readBody<Body>(event);
	const meetingId = body?.meetingId;
	if (!meetingId) {
		throw createError({ statusCode: 400, message: 'meetingId is required' });
	}

	// Org-membership check: meeting must be on an org the user belongs to.
	// We do this by reading host_user.organizations or attendees.directus_user.organizations.
	// Simplest correct path: only allow the host or someone in a matching org_membership.
	const directus = getTypedDirectus();
	let meeting: any;
	try {
		meeting = await directus.request(
			readItem('video_meetings', meetingId, {
				fields: [
					'id',
					'host_user',
					'related_organization',
					'project.organization',
					'project_event.project.organization',
					'transcript_text',
					'transcript_id',
					'room_name',
				] as any,
			}),
		);
	} catch (err: any) {
		throw createError({ statusCode: 404, message: 'Meeting not found' });
	}

	const meetingOrgId =
		(typeof meeting.related_organization === 'object' ? meeting.related_organization?.id : meeting.related_organization) ||
		(typeof meeting.project === 'object' && typeof meeting.project?.organization === 'object'
			? meeting.project.organization.id
			: typeof meeting.project === 'object' ? meeting.project?.organization : null) ||
		(typeof meeting.project_event === 'object' && typeof meeting.project_event?.project === 'object'
			? (typeof meeting.project_event.project.organization === 'object'
				? meeting.project_event.project.organization.id
				: meeting.project_event.project.organization)
			: null);

	const hostId = typeof meeting.host_user === 'object' ? meeting.host_user?.id : meeting.host_user;
	const isHost = hostId === userId;

	if (!isHost) {
		if (!meetingOrgId) {
			throw createError({ statusCode: 403, message: 'Not authorised for this meeting' });
		}
		await requireOrgMembership(event, meetingOrgId);
	}

	if (!meeting.transcript_text) {
		// Fallback path: maybe the webhook was missed. If Daily has a finished
		// transcript for this room, ingest it inline now so the host can recover
		// without us re-running a manual SQL update.
		let recovered = false;
		try {
			const transcriptId = meeting.transcript_id || (meeting.room_name ? await fetchLatestTranscriptIdForRoom(meeting.room_name) : null);
			if (transcriptId) {
				const meta = await getDailyTranscript(transcriptId);
				const downloadUrl = meta.download_link || meta.out_file_url;
				if (downloadUrl && (meta.status === 'finished' || !meta.status)) {
					const vtt = await fetchDailyTranscriptBody(downloadUrl);
					const plain = vttToPlainText(vtt);
					if (plain.trim()) {
						await directus.request(
							updateItem('video_meetings', meetingId, {
								transcript_id: transcriptId,
								transcript_url: meta.out_file_url || downloadUrl,
								transcript_text: plain,
								summary_status: 'pending',
							}),
						);
						recovered = true;
					}
				}
			}
		} catch (err: any) {
			console.warn('[meeting-summary] Daily transcript recovery failed:', err.message);
		}

		if (!recovered) {
			throw createError({
				statusCode: 409,
				message: 'No transcript yet. Make sure transcription was on during the meeting (host menu in the Daily prebuilt UI). Once Daily finishes the transcript Earnest will pick it up automatically.',
			});
		}
	}

	try {
		const result = await generateAndSaveMeetingSummary(meetingId);

		// Best-effort usage logging (uses session token).
		if (result.usage) {
			await logAIUsage({
				event,
				endpoint: 'meeting-summary',
				model: result.model,
				inputTokens: result.usage.inputTokens,
				outputTokens: result.usage.outputTokens,
				organizationId: meetingOrgId || undefined,
				metadata: { meeting_id: meetingId },
			}).catch(() => {});
		}

		return {
			success: true,
			summary: result.summary,
			action_items: result.action_items,
		};
	} catch (err: any) {
		throw createError({ statusCode: 500, message: err.message || 'Summary generation failed' });
	}
});
