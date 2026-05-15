// server/utils/daily.ts
/**
 * Daily.co API client for video meetings.
 *
 * Replaces Twilio Video. Daily.co is ~4x cheaper and uses a simpler
 * REST API + iframe-based prebuilt UI (no client SDK needed).
 *
 * Docs: https://docs.daily.co/reference/rest-api
 */

const DAILY_BASE_URL = 'https://api.daily.co/v1';

function getDailyApiKey(): string {
	const config = useRuntimeConfig();
	const key = (config as any).dailyApiKey || process.env.DAILY_API_KEY;
	if (!key) throw new Error('DAILY_API_KEY is not configured');
	return key;
}

async function dailyFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
	const res = await fetch(`${DAILY_BASE_URL}${path}`, {
		...options,
		headers: {
			'Authorization': `Bearer ${getDailyApiKey()}`,
			'Content-Type': 'application/json',
			...options.headers,
		},
	});
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Daily.co API error ${res.status}: ${error}`);
	}
	return res.json() as Promise<T>;
}

export interface DailyRoom {
	id: string;
	name: string;
	url: string;
	created_at: string;
	config: Record<string, any>;
}

export interface DailyMeetingToken {
	token: string;
}

/**
 * Create a Daily.co room for a meeting.
 * Rooms auto-delete after expiry.
 *
 * Transcription model/language are configured at the domain level in the Daily
 * dashboard — the host starts transcription from the prebuilt "..." menu.
 * `enable_transcription_storage` keeps the transcript file available after
 * the meeting so we can download + summarise it.
 */
export async function createDailyRoom(params: {
	name: string;
	expiresAt?: Date;
	maxParticipants?: number;
	enableRecording?: boolean;
	enableTranscription?: boolean;
	enableKnocking?: boolean;
}): Promise<DailyRoom> {
	const expiresAt = params.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
	const enableTranscription = params.enableTranscription ?? true;
	const enableKnocking = params.enableKnocking ?? false;

	return dailyFetch<DailyRoom>('/rooms', {
		method: 'POST',
		body: JSON.stringify({
			name: params.name,
			properties: {
				exp: Math.floor(expiresAt.getTime() / 1000),
				max_participants: params.maxParticipants ?? 25,
				// Always wire cloud recording capability — actual recording only
				// starts when the host clicks the in-room record button. This way
				// the option is always available regardless of whether the host
				// pre-checked the "enable recording" box at scheduling time.
				enable_recording: 'cloud',
				enable_chat: true,
				enable_screenshare: true,
				start_video_off: false,
				start_audio_off: false,
				// Always enable transcription storage — the storage flag is what
				// makes the prebuilt "Transcribe" button save the VTT after the
				// call. We previously gated this on per-meeting opt-in, which
				// meant hosts who flipped the room-creation toggle off (or who
				// joined a room that was created before the flag became a
				// default) would press Transcribe and see no transcript on the
				// recap page. The per-meeting `transcription_enabled` flag is
				// still honoured downstream — it just no longer suppresses the
				// underlying capability.
				enable_transcription_storage: true,
				// Knock-and-admit. When the meeting was created with the
				// "Waiting room" toggle on, we delegate the entire knock/admit
				// flow to Daily's prebuilt — `enable_knocking` makes guests hit
				// a knock screen inside the iframe and notifies the owner-token
				// host with an in-room "Someone is asking to join" panel.
				// `enable_prejoin_ui` is required for the knock screen to
				// surface (otherwise Daily auto-joins them past it).
				enable_knocking: enableKnocking,
				enable_prejoin_ui: enableKnocking,
				permissions: {
					canAdmin: ['transcription'],
				},
			},
		}),
	});
}

/**
 * Ensure recording + transcription are enabled on an existing room. Used to
 * retro-fit rooms that were created before these became defaults — without
 * the flags the prebuilt UI hides the record/transcribe buttons and
 * startRecording()/startTranscription() on the wrapped iframe are no-ops.
 */
export async function ensureRoomRecordingEnabled(roomName: string): Promise<void> {
	try {
		await dailyFetch(`/rooms/${roomName}`, {
			method: 'POST',
			body: JSON.stringify({
				properties: {
					enable_recording: 'cloud',
					enable_transcription_storage: true,
					permissions: { canAdmin: ['transcription'] },
				},
			}),
		});
	} catch (err) {
		console.warn(`[daily] failed to ensure recording on ${roomName}:`, err);
	}
}

/**
 * Patch an existing Daily room. Used by the meeting-edit endpoint to push
 * waiting-room + timing changes to the live room without recreating it.
 * Daily's REST API treats POST /rooms/{name} as an upsert when the room
 * exists; only the properties you pass are touched.
 */
export async function updateDailyRoom(
	roomName: string,
	properties: Record<string, any>,
): Promise<void> {
	try {
		await dailyFetch(`/rooms/${roomName}`, {
			method: 'POST',
			body: JSON.stringify({ properties }),
		});
	} catch (err) {
		console.warn(`[daily] failed to update room ${roomName}:`, err);
		throw err;
	}
}

/**
 * Look up a Daily.co transcript record by its ID.
 * Returns the transcript metadata + a short-lived `download_link` to the WebVTT file.
 *
 * Docs: https://docs.daily.co/reference/rest-api/transcript/get-transcript-info
 */
export interface DailyTranscript {
	transcriptId: string;
	domainId: string;
	roomId: string;
	mtgSessionId?: string;
	status?: 'in-progress' | 'finished' | 'failed';
	out_file_url?: string;
	download_link?: string;
}

export async function getDailyTranscript(transcriptId: string): Promise<DailyTranscript> {
	return dailyFetch<DailyTranscript>(`/transcript/${transcriptId}`);
}

/**
 * Fetch the WebVTT body for a Daily transcript. Returns the raw VTT text.
 * The download URL from Daily is short-lived (~minutes), so we fetch it
 * immediately after the transcript metadata.
 */
export async function fetchDailyTranscriptBody(downloadUrl: string): Promise<string> {
	const res = await fetch(downloadUrl);
	if (!res.ok) {
		throw new Error(`Failed to download transcript: ${res.status} ${res.statusText}`);
	}
	return res.text();
}

/**
 * Parse Daily's WebVTT transcript into speaker-labelled plain text.
 * Daily encodes speaker as a NOTE Speaker-N line before each cue, or as a
 * `<v Speaker N>...</v>` voice tag inside the cue. We accept either.
 */
export function vttToPlainText(vtt: string): string {
	const lines = vtt.split(/\r?\n/);
	const out: { speaker: string; text: string }[] = [];
	let currentSpeaker = '';
	let lastSpeaker = '';
	let buffer = '';

	const flush = () => {
		const text = buffer.trim();
		if (!text) return;
		const speaker = currentSpeaker || 'Speaker';
		// Coalesce consecutive cues from the same speaker into a paragraph.
		if (out.length > 0 && out[out.length - 1]!.speaker === speaker) {
			out[out.length - 1]!.text += ' ' + text;
		} else {
			out.push({ speaker, text });
		}
		lastSpeaker = speaker;
		buffer = '';
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const trimmed = line.trim();
		if (!trimmed || trimmed === 'WEBVTT') continue;

		// Daily emits `NOTE Speaker N` immediately before that speaker's cue.
		if (trimmed.startsWith('NOTE ')) {
			const m = trimmed.match(/^NOTE\s+(.+)$/);
			if (m) currentSpeaker = m[1]!.trim();
			continue;
		}

		// Cue timing lines look like `00:00:01.000 --> 00:00:04.500` — not text.
		if (/-->/i.test(trimmed)) {
			flush();
			continue;
		}

		// Numeric cue identifiers — skip.
		if (/^\d+$/.test(trimmed)) continue;

		// Inline voice tag `<v Speaker 1>hello</v>` — extract speaker + content.
		const voiceMatch = trimmed.match(/<v\s+([^>]+)>(.*?)(?:<\/v>|$)/i);
		if (voiceMatch) {
			currentSpeaker = voiceMatch[1]!.trim();
			buffer += (buffer ? ' ' : '') + voiceMatch[2]!.trim();
			continue;
		}

		buffer += (buffer ? ' ' : '') + trimmed;
	}
	flush();

	return out.map((p) => `${p.speaker}: ${p.text}`).join('\n\n');
}

/**
 * List cloud recordings for a room. Returns everything Daily has for this
 * room name, sorted newest-first. Recordings persist in Daily's cloud until
 * a domain owner deletes them, so the list survives room-expiry.
 */
export interface DailyRecording {
	id: string;
	room_name: string;
	start_ts: number;
	status: 'in-progress' | 'finished' | 'canceled';
	duration?: number;
	max_participants?: number;
	mtgSessionId?: string;
	tracks?: Array<Record<string, any>>;
}

export async function listDailyRecordings(roomName: string, limit = 100): Promise<DailyRecording[]> {
	const params = new URLSearchParams({ room_name: roomName, limit: String(limit) });
	const res = await dailyFetch<{ data: DailyRecording[]; total_count?: number }>(`/recordings?${params}`);
	const list = res.data || [];
	return list.sort((a, b) => (b.start_ts || 0) - (a.start_ts || 0));
}

/**
 * Mint a short-lived download URL for a single recording.
 * Daily's access links expire (~1hr) so we mint per click.
 */
export async function getDailyRecordingAccessLink(recordingId: string): Promise<string> {
	const res = await dailyFetch<{ download_link: string; expires?: number }>(
		`/recordings/${recordingId}/access-link`,
	);
	if (!res.download_link) {
		throw new Error('Daily returned no download_link for recording');
	}
	return res.download_link;
}

/**
 * Generate a meeting token for a participant.
 * Tokens control permissions (owner vs guest).
 *
 * `redirectOnExit` plumbs Daily's `redirect_on_meeting_exit` token property —
 * when set, the prebuilt UI sends the leaver to that URL after they click
 * "Leave". We use it for the marketing follow-up page so guests joining via
 * the Daily.co subdomain land on a real upsell, not Daily's blank exit screen.
 */
export async function createDailyMeetingToken(params: {
	roomName: string;
	userId?: string;
	userName?: string;
	isOwner?: boolean;
	expiresAt?: Date;
	redirectOnExit?: string;
	/** When true, Daily server-side starts transcription on join. Avoids the
	 *  wrap'd-iframe race where `startTranscription()` is called before
	 *  Daily's internal state machine is ready. Only honored for owners. */
	autoStartTranscription?: boolean;
	/** Same idea for recording — server-side auto-start on join. */
	autoStartRecording?: boolean;
}): Promise<string> {
	const expiresAt = params.expiresAt ?? new Date(Date.now() + 4 * 60 * 60 * 1000);
	const isOwner = params.isOwner ?? false;

	const result = await dailyFetch<DailyMeetingToken>('/meeting-tokens', {
		method: 'POST',
		body: JSON.stringify({
			properties: {
				room_name: params.roomName,
				user_id: params.userId,
				user_name: params.userName,
				is_owner: isOwner,
				exp: Math.floor(expiresAt.getTime() / 1000),
				eject_at_token_exp: true,
				// Owners explicitly get transcription-admin so the "Transcribe"
				// button surfaces in Daily's prebuilt toolbar. The room-level
				// `permissions.canAdmin: ['transcription']` should already cover
				// this, but Daily occasionally requires the same on the token
				// before the button renders — belt-and-braces avoids the dead
				// button hosts were reporting.
				...(isOwner ? { permissions: { canAdmin: ['transcription'] as any } } : {}),
				// Server-side auto-start. Daily kicks these on as soon as the
				// owner joins, which is far more reliable than firing
				// startTranscription()/startRecording() from the wrap'd
				// prebuilt iframe after `joined-meeting`.
				...(isOwner && params.autoStartTranscription
					? { auto_start_transcription: true }
					: {}),
				...(isOwner && params.autoStartRecording
					? { auto_start_recording: true }
					: {}),
				...(params.redirectOnExit
					? { redirect_on_meeting_exit: params.redirectOnExit }
					: {}),
			},
		}),
	});
	return result.token;
}

/**
 * Delete a Daily.co room explicitly (cleanup after meeting ends).
 */
export async function deleteDailyRoom(roomName: string): Promise<void> {
	await dailyFetch(`/rooms/${roomName}`, { method: 'DELETE' });
}

/**
 * Get room info (check if it exists, participant count, etc.)
 */
export async function getDailyRoom(roomName: string): Promise<DailyRoom | null> {
	try {
		return await dailyFetch<DailyRoom>(`/rooms/${roomName}`);
	} catch {
		return null;
	}
}
