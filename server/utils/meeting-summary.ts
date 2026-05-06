// server/utils/meeting-summary.ts
/**
 * Meeting Summary — internal helper for generating an AI recap from a transcript.
 *
 * Two entry points use this:
 *   - the user-facing POST /api/ai/meeting-summary endpoint (manual regenerate)
 *   - the Daily transcript.ready-to-download webhook (auto-summary on meeting end)
 *
 * Pulls related project / project_event / client context to make the recap
 * meaningfully grounded — not just a generic transcript summary.
 */

import { readItem, readItems, updateItem } from '@directus/sdk';
import { getLLMProvider } from './llm/factory';

export interface MeetingSummaryResult {
	summary: string;
	action_items: Array<{ description: string; assignee?: string | null; due_date?: string | null }>;
	model: string;
	usage?: { inputTokens: number; outputTokens: number };
}

interface MeetingForSummary {
	id: string;
	title?: string | null;
	description?: string | null;
	scheduled_start?: string | null;
	actual_start?: string | null;
	actual_duration_minutes?: number | null;
	host_identity?: string | null;
	transcript_text?: string | null;
	host_user?: { first_name?: string | null; last_name?: string | null } | string | null;
	project?: { id: string; title?: string | null; status?: string | null } | string | null;
	project_event?: {
		id: string;
		title?: string | null;
		event_type?: string | null;
		event_date?: string | null;
		project?: { id: string; title?: string | null } | string | null;
	} | string | null;
	related_lead?: { id: number | string; name?: string | null } | string | number | null;
	related_organization?: { id: string; name?: string | null } | string | null;
	related_contact?: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null } | string | null;
	attendees?: Array<{ guest_name?: string | null; guest_email?: string | null; directus_user?: { first_name?: string | null; last_name?: string | null } | string | null }>;
}

const SUMMARY_FIELDS = [
	'id',
	'title',
	'description',
	'scheduled_start',
	'actual_start',
	'actual_duration_minutes',
	'host_identity',
	'transcript_text',
	'host_user.first_name',
	'host_user.last_name',
	'project.id',
	'project.title',
	'project.status',
	'project_event.id',
	'project_event.title',
	'project_event.event_type',
	'project_event.event_date',
	'project_event.project.id',
	'project_event.project.title',
	'related_lead.id',
	'related_lead.name',
	'related_organization.id',
	'related_organization.name',
	'related_contact.id',
	'related_contact.first_name',
	'related_contact.last_name',
	'related_contact.email',
	'attendees.guest_name',
	'attendees.guest_email',
	'attendees.directus_user.first_name',
	'attendees.directus_user.last_name',
];

function formatAttendees(meeting: MeetingForSummary): string {
	const lines: string[] = [];
	const host = meeting.host_user;
	if (host && typeof host === 'object') {
		const name = `${host.first_name || ''} ${host.last_name || ''}`.trim();
		if (name) lines.push(`- ${name} (host)`);
	} else if (meeting.host_identity) {
		lines.push(`- ${meeting.host_identity} (host)`);
	}
	for (const a of meeting.attendees || []) {
		const u = a.directus_user;
		if (u && typeof u === 'object') {
			const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
			if (name) { lines.push(`- ${name}`); continue; }
		}
		if (a.guest_name) lines.push(`- ${a.guest_name}${a.guest_email ? ` <${a.guest_email}>` : ''}`);
	}
	return lines.length ? lines.join('\n') : '- (attendee list unavailable)';
}

function formatNotesBlock(notes: any[]): string {
	if (!notes?.length) return '';
	const decisions = notes.filter((n) => n.note_type === 'decision');
	const general = notes.filter((n) => n.note_type !== 'decision');
	const lines: string[] = ['Manual notes & decisions captured during the call (treat as ground truth — these came from the team, not the transcript):'];
	const fmt = (n: any) => {
		const who = n.author && typeof n.author === 'object'
			? `${n.author.first_name || ''} ${n.author.last_name || ''}`.trim()
			: '';
		const when = typeof n.meeting_offset_seconds === 'number'
			? `+${Math.floor(n.meeting_offset_seconds / 60)}m`
			: '';
		const tag = [who, when].filter(Boolean).join(' ');
		return tag ? `  - (${tag}) ${n.content}` : `  - ${n.content}`;
	};
	if (decisions.length) {
		lines.push('');
		lines.push('Decisions:');
		decisions.forEach((n) => lines.push(fmt(n)));
	}
	if (general.length) {
		lines.push('');
		lines.push('Notes:');
		general.forEach((n) => lines.push(fmt(n)));
	}
	return lines.join('\n');
}

function buildContextBlock(meeting: MeetingForSummary): string {
	const parts: string[] = [];
	parts.push(`Meeting: ${meeting.title || '(untitled)'}`);
	if (meeting.scheduled_start) parts.push(`Scheduled: ${meeting.scheduled_start}`);
	if (meeting.actual_duration_minutes) parts.push(`Duration: ${meeting.actual_duration_minutes} minutes`);
	if (meeting.description) parts.push(`Agenda: ${meeting.description}`);

	const project = typeof meeting.project === 'object' ? meeting.project : null;
	const eventProject = typeof meeting.project_event === 'object'
		? (typeof meeting.project_event.project === 'object' ? meeting.project_event.project : null)
		: null;
	const proj = project || eventProject;
	if (proj) {
		parts.push(`Project: ${proj.title || proj.id}`);
	}

	const event = typeof meeting.project_event === 'object' ? meeting.project_event : null;
	if (event) {
		const detail = [event.event_type, event.event_date].filter(Boolean).join(' · ');
		parts.push(`Milestone: ${event.title || event.id}${detail ? ` (${detail})` : ''}`);
	}

	const org = typeof meeting.related_organization === 'object' ? meeting.related_organization : null;
	if (org?.name) parts.push(`Client: ${org.name}`);

	const contact = typeof meeting.related_contact === 'object' ? meeting.related_contact : null;
	if (contact) {
		const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
		if (name) parts.push(`Contact: ${name}${contact.email ? ` <${contact.email}>` : ''}`);
	}

	parts.push('');
	parts.push('Attendees:');
	parts.push(formatAttendees(meeting));
	return parts.join('\n');
}

const SYSTEM_PROMPT = `You are Earnest, an executive-assistant AI that recaps meetings for creative agencies and freelancers.

Given a meeting transcript and the surrounding context (project, milestone, client, attendees), produce a tight, useful recap that helps the team move forward without re-reading the call.

Rules:
- Reference the project/milestone/client by name where it grounds the recap.
- Don't invent decisions or commitments. If the transcript is sparse or noisy, say so.
- Action items must be concrete enough that the assignee knows exactly what to do.
- Use the attendee list to attribute action items to real people. If unclear, leave assignee null.
- Output STRICT JSON only — no commentary, no markdown fence.

Schema:
{
  "summary": "Markdown-formatted recap. 3 short sections: ## TL;DR, ## Decisions, ## Discussion. Use bullet lists. Keep total length under 350 words.",
  "action_items": [
    {
      "description": "string — what needs to happen",
      "assignee": "string or null — name from attendee list",
      "due_date": "ISO date (YYYY-MM-DD) or null"
    }
  ]
}`;

function tryParseJson(raw: string): MeetingSummaryResult | null {
	const trimmed = raw.trim();
	const candidates = [
		trimmed,
		trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, ''),
	];
	for (const c of candidates) {
		try {
			const parsed = JSON.parse(c);
			if (parsed && typeof parsed.summary === 'string' && Array.isArray(parsed.action_items)) {
				return {
					summary: parsed.summary,
					action_items: parsed.action_items.map((it: any) => ({
						description: String(it.description || '').trim(),
						assignee: it.assignee ? String(it.assignee) : null,
						due_date: it.due_date ? String(it.due_date) : null,
					})).filter((it: any) => it.description),
					model: '',
				};
			}
		} catch { /* try next */ }
	}
	return null;
}

/**
 * Generate a meeting recap and persist it to video_meetings.
 * Throws on hard errors (no transcript, AI failure). Caller decides whether
 * to surface the error to the user or write `summary_status='failed'`.
 */
export async function generateAndSaveMeetingSummary(meetingId: string): Promise<MeetingSummaryResult> {
	const directus = getTypedDirectus();

	// Mark as generating up-front so concurrent triggers don't double-bill.
	await directus.request(
		updateItem('video_meetings', meetingId, {
			summary_status: 'generating',
			summary_error: null,
		}),
	).catch(() => { /* best effort */ });

	let meeting: MeetingForSummary;
	try {
		meeting = await directus.request(
			readItem('video_meetings', meetingId, { fields: SUMMARY_FIELDS as any }),
		) as unknown as MeetingForSummary;
	} catch (err: any) {
		await directus.request(
			updateItem('video_meetings', meetingId, {
				summary_status: 'failed',
				summary_error: `Meeting fetch failed: ${err.message}`,
			}),
		).catch(() => {});
		throw err;
	}

	const transcript = (meeting.transcript_text || '').trim();
	if (!transcript) {
		await directus.request(
			updateItem('video_meetings', meetingId, {
				summary_status: 'failed',
				summary_error: 'No transcript available — start transcription during the meeting',
			}),
		).catch(() => {});
		throw new Error('No transcript available for this meeting');
	}

	const contextBlock = buildContextBlock(meeting);

	// Pull human-captured notes/decisions before the transcript so the model
	// weights team-marked moments above raw transcript noise. Best-effort —
	// missing notes shouldn't fail summary generation.
	const notes = await directus.request(
		readItems('meeting_notes', {
			filter: { meeting: { _eq: meetingId } },
			fields: [
				'id', 'note_type', 'content', 'meeting_offset_seconds', 'date_created',
				'author.first_name', 'author.last_name',
			] as any,
			sort: ['date_created'],
			limit: 200,
		}),
	).catch(() => []) as any[];

	const notesBlock = formatNotesBlock(notes);
	const userPrompt = notesBlock
		? `${contextBlock}\n\n${notesBlock}\n\n---\n\nTranscript:\n\n${transcript}`
		: `${contextBlock}\n\n---\n\nTranscript:\n\n${transcript}`;

	const provider = getLLMProvider();
	let llmResp;
	try {
		llmResp = await provider.chat(
			[{ role: 'user', content: userPrompt }],
			{ systemPrompt: SYSTEM_PROMPT, maxTokens: 2000, temperature: 0.3 },
		);
	} catch (err: any) {
		await directus.request(
			updateItem('video_meetings', meetingId, {
				summary_status: 'failed',
				summary_error: `LLM call failed: ${err.message}`,
			}),
		).catch(() => {});
		throw err;
	}

	const parsed = tryParseJson(llmResp.content);
	if (!parsed) {
		await directus.request(
			updateItem('video_meetings', meetingId, {
				summary_status: 'failed',
				summary_error: 'Could not parse LLM JSON output',
			}),
		).catch(() => {});
		throw new Error('Failed to parse meeting summary JSON');
	}

	const result: MeetingSummaryResult = {
		summary: parsed.summary,
		action_items: parsed.action_items,
		model: llmResp.model || 'claude',
		usage: llmResp.usage,
	};

	await directus.request(
		updateItem('video_meetings', meetingId, {
			summary: result.summary,
			action_items: result.action_items,
			summary_status: 'complete',
			summary_generated_at: new Date().toISOString(),
			summary_error: null,
		}),
	);

	return result;
}
