<script setup lang="ts">
/**
 * HeaderScore — compact Earnest Points counter for the apps-shell header.
 *
 * A perfect circle: today's EP leads, the running total sits tiny beneath it.
 * The circle pulses and glows on every award (via useEarnestScoreBus) —
 * including the silent awards (comments, messages, daily check-in) that skip
 * the big +EP pop, so those still get a subtle acknowledgement here. Clicking
 * opens the full Earnest Score view.
 */
const router = useRouter();
const { selectedOrg, initializeOrganizations } = useOrganization();
const { totalEP, todayEP, level, pulseId, set } = useEarnestScoreBus();

// Seed / refresh the authoritative totals from the server. Runs on mount and
// whenever the active org changes (each org has its own score row).
async function refresh() {
	const orgId = selectedOrg.value;
	if (!orgId) return;
	try {
		const res = await $fetch<any>('/api/score/me', { params: { orgId } });
		const d = res?.data;
		if (d) set(Number(d.total_ep) || 0, Number(d.today_ep) || 0, Number(d.level) || 1);
	} catch {
		/* best-effort — the counter just stays at its last known value */
	}
}

onMounted(async () => {
	// The header mounts before the org resolves; ensure init (deduped in-flight)
	// so we have an org to scope the score to. Then keep in sync on org switch.
	if (!selectedOrg.value) {
		try { await initializeOrganizations(); } catch { /* ignore */ }
	}
	refresh();
});
watch(selectedOrg, refresh);

// Flash the circle + pop the number when an award lands.
const flashing = ref(false);
let flashTimer: ReturnType<typeof setTimeout> | null = null;
watch(pulseId, () => {
	flashing.value = false;
	requestAnimationFrame(() => {
		flashing.value = true;
		if (flashTimer) clearTimeout(flashTimer);
		flashTimer = setTimeout(() => { flashing.value = false; }, 720);
	});
});
onBeforeUnmount(() => { if (flashTimer) clearTimeout(flashTimer); });

// Compact large numbers so they fit the circle (e.g. 1.2k).
function compact(n: number | null): string {
	if (n == null) return '';
	if (n < 1000) return String(n);
	if (n < 100000) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '')}k`;
	return `${Math.round(n / 1000)}k`;
}
const loaded = computed(() => todayEP.value != null);
const todayDisplay = computed(() => (loaded.value ? compact(todayEP.value) : ''));
const totalDisplay = computed(() => (totalEP.value != null ? compact(totalEP.value) : ''));
</script>

<template>
	<button
		type="button"
		class="header-score"
		:class="{ 'header-score--flash': flashing }"
		:aria-label="`Earnest Points — ${todayDisplay || 0} today, ${totalDisplay || 0} total, level ${level}. Open Earnest Score`"
		:title="`${todayDisplay || 0} EP today · ${totalDisplay || 0} total · Level ${level}`"
		@click="router.push('/account?section=score')"
	>
		<span class="header-score__today tabular-nums">{{ todayDisplay || '0' }}</span>
		<span v-if="totalDisplay" class="header-score__total tabular-nums">{{ totalDisplay }}</span>
	</button>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* Perfect circle. Fixed square + rounded-full so it never distorts. */
.header-score {
	@apply relative inline-flex flex-col items-center justify-center shrink-0
		text-foreground/80 hover:text-foreground transition-colors;
	width: 40px;
	height: 40px;
	border-radius: 9999px;
	background: hsl(var(--app-accent-h, 38) var(--app-accent-s, 92%) 50% / 0.1);
	border: 1px solid hsl(var(--app-accent-h, 38) var(--app-accent-s, 92%) 50% / 0.25);
	line-height: 1;
}
.header-score:hover {
	background: hsl(var(--app-accent-h, 38) var(--app-accent-s, 92%) 50% / 0.16);
}

.header-score__today {
	@apply font-bold;
	font-size: 13px;
	letter-spacing: -0.02em;
}

.header-score__total {
	@apply font-medium text-muted-foreground;
	font-size: 8px;
	margin-top: 1px;
}

/* Award flash: scale + accent-glow pulse on the circle, colour flash on today. */
.header-score--flash {
	animation: headerScoreCircle 0.72s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.header-score--flash .header-score__today {
	animation: headerScoreToday 0.72s ease-out;
}
@keyframes headerScoreCircle {
	0%   { transform: scale(1); box-shadow: 0 0 0 0 hsl(38 92% 55% / 0); }
	35%  { transform: scale(1.18); box-shadow: 0 0 10px 2px hsl(38 92% 55% / 0.65); }
	70%  { transform: scale(0.97); }
	100% { transform: scale(1); box-shadow: 0 0 0 0 hsl(38 92% 55% / 0); }
}
@keyframes headerScoreToday {
	0%   { color: hsl(38 92% 45%); transform: translateY(0); }
	35%  { transform: translateY(-1px); }
	100% { transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
	.header-score--flash,
	.header-score--flash .header-score__today { animation: none; }
}
</style>
