/**
 * Plan-aware defaults for cloud recording + transcription.
 *
 * The org's per-row override (organizations.default_recording /
 * default_transcription) wins when set. When null (or org missing), we fall
 * through to the plan-tier default below.
 *
 * Free tier is hard-gated: paid features stay off and create-room rejects an
 * explicit `true` from the client. Paid tiers can opt in or out per meeting,
 * and per org.
 *
 * Cost figures match what we pay Daily / Deepgram and are surfaced in the
 * create-meeting modal so hosts know what they're switching on.
 */
import { readItem } from '@directus/sdk';

export type Plan = 'free' | 'solo' | 'studio' | 'agency' | 'enterprise';

export interface MeetingFeatureDefaults {
	plan: Plan;
	recording: boolean;
	transcription: boolean;
	recordingAvailable: boolean;
	transcriptionAvailable: boolean;
	recordingCostPerHour: number;
	transcriptionCostPerHour: number;
	recordingCostNote: string;
	transcriptionCostNote: string;
}

// Daily cloud recording: ~$0.0099/participant-min ⇒ $0.594/participant-hour.
// Charged per participant — a 4-person hour costs ~$2.38 of recording.
export const RECORDING_COST_PER_PARTICIPANT_HOUR = 0.594;

// Deepgram nova-2-general via Daily: ~$0.0043/min ⇒ $0.258/meeting-hour.
// Flat per meeting, not per participant.
export const TRANSCRIPTION_COST_PER_HOUR = 0.258;

const RECORDING_COST_NOTE = '~$0.59/hr per participant (Daily cloud recording)';
const TRANSCRIPTION_COST_NOTE = '~$0.26/hr per meeting (Deepgram)';

function planDefaults(plan: Plan): { recording: boolean; transcription: boolean; available: boolean } {
	switch (plan) {
		case 'free':
			// Hard gate — feature unavailable on free tier.
			return { recording: false, transcription: false, available: false };
		case 'solo':
			// Transcription is cheap and gives the recap value; recording stays
			// off until the host opts in.
			return { recording: false, transcription: true, available: true };
		case 'studio':
		case 'agency':
		case 'enterprise':
			return { recording: true, transcription: true, available: true };
	}
}

export function resolveMeetingDefaults(
	plan: Plan | null | undefined,
	orgDefaults?: { default_recording?: boolean | null; default_transcription?: boolean | null },
): MeetingFeatureDefaults {
	const safePlan: Plan = (plan ?? 'free') as Plan;
	const tier = planDefaults(safePlan);
	const recOverride = orgDefaults?.default_recording;
	const tranOverride = orgDefaults?.default_transcription;

	const recording = tier.available
		? (recOverride === true || recOverride === false ? recOverride : tier.recording)
		: false;
	const transcription = tier.available
		? (tranOverride === true || tranOverride === false ? tranOverride : tier.transcription)
		: false;

	return {
		plan: safePlan,
		recording,
		transcription,
		recordingAvailable: tier.available,
		transcriptionAvailable: tier.available,
		recordingCostPerHour: RECORDING_COST_PER_PARTICIPANT_HOUR,
		transcriptionCostPerHour: TRANSCRIPTION_COST_PER_HOUR,
		recordingCostNote: RECORDING_COST_NOTE,
		transcriptionCostNote: TRANSCRIPTION_COST_NOTE,
	};
}

/**
 * Look up an org's plan + meeting overrides via the admin token. Used by
 * create-room (where we don't yet have the user's directus client wired) and
 * the meeting-defaults endpoint.
 */
export async function fetchOrgMeetingDefaults(orgId: string): Promise<MeetingFeatureDefaults> {
	const directus = getTypedDirectus();
	try {
		const org: any = await directus.request(
			readItem('organizations', orgId, {
				fields: ['id', 'plan', 'default_recording', 'default_transcription'] as any,
			}),
		);
		return resolveMeetingDefaults(org?.plan as Plan | null, {
			default_recording: org?.default_recording,
			default_transcription: org?.default_transcription,
		});
	} catch {
		return resolveMeetingDefaults('free');
	}
}

/**
 * Throws 402 if a free-tier org tried to switch on a paid feature. Call from
 * create-room before the Daily room is provisioned.
 */
export function assertFeatureAllowed(
	defaults: MeetingFeatureDefaults,
	feature: 'recording' | 'transcription',
	requested: boolean,
) {
	if (!requested) return;
	const available = feature === 'recording' ? defaults.recordingAvailable : defaults.transcriptionAvailable;
	if (!available) {
		throw createError({
			statusCode: 402,
			message: `${feature === 'recording' ? 'Cloud recording' : 'Transcription'} requires a paid plan`,
		});
	}
}
