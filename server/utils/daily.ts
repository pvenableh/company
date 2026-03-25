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
 */
export async function createDailyRoom(params: {
	name: string;
	expiresAt?: Date;
	maxParticipants?: number;
	enableRecording?: boolean;
}): Promise<DailyRoom> {
	const expiresAt = params.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);

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
			},
		}),
	});
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
