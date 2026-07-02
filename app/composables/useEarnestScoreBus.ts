// composables/useEarnestScoreBus.ts
//
// A tiny module-level bus for the header EP counter (components/Layout/
// HeaderScore.vue). It exists so the counter can update its total and flash
// the Earnest mark on EVERY award — including the *silent* ones (comments,
// messages, daily check-in) that deliberately skip the visible +EP pop layer
// (useArcade). The reward-pop bus only sees non-silent awards, so the counter
// needs its own signal.
//
// Producers:
//   • useArcadeAwards.awardEvent() calls applyAward() with the authoritative
//     server total after each /api/score/award, silent or not.
//   • HeaderScore seeds the initial total once from /api/score/me.
//
// State is module-level so the single header counter and any awarding action
// (anywhere in the tree) share one source of truth without prop-drilling.

const totalEP = ref<number | null>(null);
const todayEP = ref<number | null>(null);
const level = ref(1);
// Bumped on every award so watchers can trigger the flash even when the total
// is unchanged (defensive) or arrives out of order.
const pulseId = ref(0);

export function useEarnestScoreBus() {
	/** Set totals from an authoritative fetch (e.g. /api/score/me). No pulse. */
	const set = (total: number, today: number, lvl?: number) => {
		totalEP.value = total;
		todayEP.value = today;
		if (lvl != null) level.value = lvl;
	};

	/** Apply an authoritative award result and pulse the counter (drives flash). */
	const applyAward = (result: { totalEP?: number; level?: number; ep?: number } | null | undefined) => {
		// Prefer the exact delta (new authoritative total − last known) so today's
		// tally captures badge bonuses too; fall back to the event's base EP.
		let delta = result?.ep ?? 0;
		if (result?.totalEP != null && totalEP.value != null) {
			delta = result.totalEP - totalEP.value;
		}
		if (result?.totalEP != null) totalEP.value = result.totalEP;
		if (todayEP.value == null) todayEP.value = Math.max(0, delta);
		else todayEP.value += Math.max(0, delta);
		if (result?.level != null) level.value = result.level;
		pulseId.value++;
	};

	return {
		totalEP: readonly(totalEP),
		todayEP: readonly(todayEP),
		level: readonly(level),
		pulseId: readonly(pulseId),
		set,
		applyAward,
	};
}
