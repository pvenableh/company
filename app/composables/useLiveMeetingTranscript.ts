/**
 * useLiveMeetingTranscript — in-page buffer for the words being spoken
 * during an active Daily meeting.
 *
 * Daily fires `transcription-message` events while transcription is
 * running — Earnest's meeting page used to drop them on the floor. We
 * now push each line into a module-level map keyed by meeting id, so
 * the AI sidebar can ask "what's been said so far?" while the call is
 * still live (the persisted VTT only lands AFTER `transcript.ready-
 * to-download` fires at meeting-end, so without this buffer the AI's
 * answer mid-call is always "nothing captured yet").
 *
 * Buffer caps at MAX_LINES — we lose older lines first, which is the
 * right shape for "tell me what was just said" prompts and prevents
 * unbounded memory growth on long meetings. The persisted transcript
 * is the source of truth for post-meeting recaps.
 */

const MAX_LINES = 500;

export interface LiveTranscriptLine {
	speaker: string;
	text: string;
	/** Epoch milliseconds when the line was received locally. */
	ts: number;
}

/** Module-level store. Keyed by meeting id (UUID) so multiple tabs / multiple
 *  meetings open at once don't cross-pollinate. */
const buffers = ref<Map<string, LiveTranscriptLine[]>>(new Map());

export function useLiveMeetingTranscript(meetingId: string | (() => string | null | undefined)) {
	const idRef = computed(() => {
		const v = typeof meetingId === 'function' ? meetingId() : meetingId;
		return v || null;
	});

	const lines = computed<LiveTranscriptLine[]>(() => {
		const id = idRef.value;
		if (!id) return [];
		return buffers.value.get(id) ?? [];
	});

	/** Formatted as `Speaker: text\n…`, capped to the last `maxLines` so the
	 *  outbound prompt doesn't blow past the model's context budget. */
	const formatted = computed(() => {
		return lines.value.map((l) => `${l.speaker}: ${l.text}`).join('\n');
	});

	function append(line: { speaker?: string; text?: string }) {
		const id = idRef.value;
		if (!id) return;
		const text = (line.text || '').trim();
		if (!text) return;
		const speaker = (line.speaker || 'Speaker').trim() || 'Speaker';

		const next = new Map(buffers.value);
		const existing = next.get(id) ?? [];
		const updated = [...existing, { speaker, text, ts: Date.now() }];
		// Drop oldest lines once we exceed the cap.
		if (updated.length > MAX_LINES) updated.splice(0, updated.length - MAX_LINES);
		next.set(id, updated);
		buffers.value = next;
	}

	function clear() {
		const id = idRef.value;
		if (!id) return;
		const next = new Map(buffers.value);
		next.delete(id);
		buffers.value = next;
	}

	return { lines, formatted, append, clear };
}

/** Direct accessor for non-component code (e.g. the chat composable
 *  reading the buffer at send-time without needing to bind a reactive
 *  meeting id). Returns the formatted string for a given meeting id, or
 *  an empty string if nothing has been buffered. */
export function getLiveTranscriptFor(meetingId: string | null | undefined): string {
	if (!meetingId) return '';
	const list = buffers.value.get(meetingId);
	if (!list?.length) return '';
	return list.map((l) => `${l.speaker}: ${l.text}`).join('\n');
}
