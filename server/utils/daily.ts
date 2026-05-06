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
 * Transcription is enabled by default — Deepgram-powered, started by the host
 * from the prebuilt "..." menu. `enable_transcription_storage` keeps the
 * transcript file after the meeting so we can download + summarise it.
 */
export async function createDailyRoom(params: {
	name: string;
	expiresAt?: Date;
	maxParticipants?: number;
	enableRecording?: boolean;
	enableTranscription?: boolean;
}): Promise<DailyRoom> {
	const expiresAt = params.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
	const enableTranscription = params.enableTranscription ?? true;

	return dailyFetch<DailyRoom>('/rooms', {
		method: 'POST',
		body: JSON.stringify({
			name: params.name,
			properties: {
				exp: Math.floor(expiresAt.getTime() / 1000),
				max_participants: params.maxParticipants ?? 25,
				enable_recording: params.enableRecording ? 'cloud' : undefined,
				enable_chat: true,
				enable_screenshare: true,
				start_video_off: false,
				start_audio_off: false,
				enable_transcription_storage: enableTranscription,
				transcription_settings: enableTranscription
					? { language: 'en', model: 'nova-2', tier: 'enhanced', profanity_filter: false }
					: undefined,
			},
		}),
	});
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
 * Generate a meeting token for a participant.
 * Tokens control permissions (owner vs guest).
 */
export async function createDailyMeetingToken(params: {
	roomName: string;
	userId?: string;
	userName?: string;
	isOwner?: boolean;
	expiresAt?: Date;
}): Promise<string> {
	const expiresAt = params.expiresAt ?? new Date(Date.now() + 4 * 60 * 60 * 1000);

	const result = await dailyFetch<DailyMeetingToken>('/meeting-tokens', {
		method: 'POST',
		body: JSON.stringify({
			properties: {
				room_name: params.roomName,
				user_id: params.userId,
				user_name: params.userName,
				is_owner: params.isOwner ?? false,
				exp: Math.floor(expiresAt.getTime() / 1000),
				eject_at_token_exp: true,
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
