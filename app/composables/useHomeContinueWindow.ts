// composables/useHomeContinueWindow.ts
//
// Learn how long a prior home conversation stays worth resuming for THIS user.
// The presence home offers a "Continue where you left off →" chip when the last
// thread is younger than a window (default 18h — a working day plus an overnight
// return). Rather than a fixed threshold, or a setting nobody would tune, the
// window adapts to behaviour:
//   • resume the chip                     → threads are worth picking back up → widen
//   • ignore it (start fresh while shown) → not worth it at this age         → narrow
// so the offer decays when it stops fitting — the same spirit as the density
// heuristic in [[useHomeTendency]]. Purely device-local: "how long do I care
// about my own threads" is a per-machine feel, so it lives in localStorage, not
// a synced pref. Bounded so it can never wander far from the sensible default.
//
// See [[project_presence_home]].

const KEY = 'earnest.home.continueWindow.v1';
const DEFAULT_HOURS = 18;
const MIN_HOURS = 4;
const MAX_HOURS = 72;
const STEP_HOURS = 6;

function clamp(h: number): number {
	return Math.min(MAX_HOURS, Math.max(MIN_HOURS, h));
}

function readHours(): number {
	if (import.meta.server) return DEFAULT_HOURS;
	try {
		const raw = Number(JSON.parse(localStorage.getItem(KEY) || '{}').hours);
		return Number.isFinite(raw) ? clamp(raw) : DEFAULT_HOURS;
	} catch {
		return DEFAULT_HOURS;
	}
}

function writeHours(hours: number) {
	if (import.meta.server) return;
	try { localStorage.setItem(KEY, JSON.stringify({ hours })); } catch { /* private mode / quota */ }
}

export function useHomeContinueWindow() {
	// Read once at setup — the window only has to be right at first paint, where
	// it decides whether the chip shows for the thread that just hydrated.
	const hours = ref(readHours());
	const windowMs = computed(() => hours.value * 60 * 60 * 1000);

	function nudge(deltaHours: number) {
		const next = clamp(hours.value + deltaHours);
		if (next === hours.value) return;
		hours.value = next;
		writeHours(next);
	}
	const recordResumed = () => nudge(STEP_HOURS);   // wanted it → keep offering for longer
	const recordIgnored = () => nudge(-STEP_HOURS);  // skipped it → offer for less

	return { windowMs, hours: readonly(hours), recordResumed, recordIgnored };
}
