<script setup lang="ts">
/**
 * <EarnestMirror> — the Learning surface: a READ-ONLY reflection of how you
 * actually work, shown inside Focus mode. It doesn't draw a scoreboard — it
 * FINDS patterns and hands you a lever for each.
 *
 *   · Earnest's read — a short honest synthesis of the meta-pattern (LLM,
 *     grounded strictly in the numbers; loads a beat after the cards).
 *   · Insights — avoidance, completion-latency, overdue slippage, the client
 *     eating your backlog. Each has a one-tap lever that continues in Focus.
 *   · By the numbers — your local-time rhythm + momentum, demoted to a strip.
 *
 * The heavy lifting (the insight engine) is server-side (mirror-signals.ts);
 * only the timezone-sensitive rhythm is computed here so it's true in local time.
 */
const props = defineProps<{ active: boolean }>();
const emit = defineEmits<{ lever: [prompt: string] }>();

const { selectedOrg } = useOrganization();

interface Insight { id: string; kind: string; severity: number; headline: string; evidence: string; lever?: { label: string; prompt: string } }
interface MirrorData {
	generatedAt: string;
	signals: null | {
		completedCount: number; medianLatencyDays: number | null; slowTailCount: number;
		openNow: number; avoidanceCount: number; overdueCount: number;
	};
	insights: Insight[];
	completions: string[];
	momentum: null | { score: number; streak: number; bestStreak: number; daysActiveThisWeek: number; totalTasksCompleted: number };
	history: Array<{ date: string; score: number }>;
}

const data = ref<MirrorData | null>(null);
const loading = ref(false);
const errored = ref(false);
const read = ref('');
const readLoading = ref(false);
let loadedOnce = false;

async function load(force = false) {
	if (loading.value) return;
	if (loadedOnce && !force) return;
	const orgId = selectedOrg.value;
	if (!orgId) return;
	loading.value = true;
	errored.value = false;
	try {
		data.value = await $fetch<MirrorData>('/api/mirror/me', { query: { orgId } });
		loadedOnce = true;
		loadRead(orgId);
	} catch {
		errored.value = true;
	} finally {
		loading.value = false;
	}
}

async function loadRead(orgId: string) {
	if (!hasAnything.value) return;
	readLoading.value = true;
	try {
		const res = await $fetch<{ read: string }>('/api/mirror/reflect', { method: 'POST', body: { orgId } });
		read.value = res?.read || '';
	} catch {
		read.value = '';
	} finally {
		readLoading.value = false;
	}
}

watch(() => props.active, (on) => { if (on) load(); }, { immediate: true });

// ── Local-timezone rhythm (from raw completion timestamps) ───────────────────
const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const rhythm = computed(() => {
	const c = data.value?.completions ?? [];
	const byWeekday = [0, 0, 0, 0, 0, 0, 0];
	for (const isoStr of c) {
		const d = new Date(isoStr);
		if (!Number.isNaN(d.getTime())) byWeekday[d.getDay()] = (byWeekday[d.getDay()] ?? 0) + 1;
	}
	const total = c.length;
	const peakIdx = total ? byWeekday.indexOf(Math.max(...byWeekday)) : -1;
	return { total, byWeekday, max: Math.max(1, ...byWeekday), peak: peakIdx >= 0 ? WEEKDAYS[peakIdx] : null };
});

const trend = computed(() => {
	const h = data.value?.history ?? [];
	if (h.length < 4) return 'flat' as 'up' | 'down' | 'flat';
	const third = Math.max(1, Math.floor(h.length / 3));
	const avg = (a: typeof h) => a.reduce((s, r) => s + r.score, 0) / a.length;
	const early = avg(h.slice(0, third)), late = avg(h.slice(-third));
	return late > early + 1.5 ? 'up' : late < early - 1.5 ? 'down' : 'flat';
});

const hasAnything = computed(() => {
	const d = data.value;
	if (!d) return false;
	return d.insights.length > 0 || (d.signals?.completedCount ?? 0) > 0 || !!d.momentum;
});

function fireLever(prompt: string) { emit('lever', prompt); }
</script>

<template>
	<div class="mirror">
		<div class="mirror__scroll">
			<div class="mirror__wrap">
				<header class="mirror__intro">
					<p class="mirror__eyebrow">The Mirror</p>
					<p class="mirror__lede">Not a scoreboard — what I actually notice about how you work.</p>
				</header>

				<div v-if="loading && !data" class="mirror__state">Reading your patterns…</div>
				<div v-else-if="errored" class="mirror__state">
					I couldn't gather your reflection just now.
					<button type="button" class="mirror__retry" @click="load(true)">Try again</button>
				</div>
				<div v-else-if="data && !hasAnything" class="mirror__state">
					There's not much to reflect yet. Do a little good work and come back — I'll show you your patterns.
				</div>

				<template v-else-if="data">
					<!-- Earnest's honest read -->
					<div v-if="readLoading || read" class="mirror__read">
						<Transition name="read" mode="out-in">
							<p v-if="readLoading" key="thinking" class="mirror__read-thinking">
								<span class="mirror__dots"><span /><span /><span /></span> reading the shape of it…
							</p>
							<p v-else key="read" class="mirror__read-text">{{ read }}</p>
						</Transition>
					</div>

					<!-- Insight cards, each with a lever -->
					<div v-if="data.insights.length" class="mirror__insights">
						<article v-for="ins in data.insights" :key="ins.id" class="mirror__insight" :data-kind="ins.kind">
							<p class="mirror__insight-head">{{ ins.headline }}</p>
							<p class="mirror__insight-ev">{{ ins.evidence }}</p>
							<button v-if="ins.lever" type="button" class="mirror__lever" @click="fireLever(ins.lever.prompt)">
								{{ ins.lever.label }}
								<Icon name="lucide:arrow-right" class="w-3.5 h-3.5" />
							</button>
						</article>
					</div>

					<!-- By the numbers: rhythm + momentum, demoted -->
					<div class="mirror__numbers">
						<div v-if="rhythm.total" class="mirror__num-block">
							<p class="mirror__num-label">Your rhythm</p>
							<div class="mirror__week" aria-hidden="true">
								<div v-for="(n, i) in rhythm.byWeekday" :key="i" class="mirror__day">
									<div class="mirror__day-track">
										<div class="mirror__day-bar" :class="{ 'is-peak': rhythm.peak === WEEKDAYS[i] && n > 0 }" :style="{ height: Math.round((n / rhythm.max) * 100) + '%' }" />
									</div>
									<span class="mirror__day-lab">{{ WEEKDAYS_SHORT[i] }}</span>
								</div>
							</div>
							<p v-if="rhythm.peak" class="mirror__num-note">You close the most on {{ rhythm.peak }}s.</p>
						</div>

						<div v-if="data.momentum" class="mirror__num-block">
							<p class="mirror__num-label">Momentum
								<span class="mirror__trend" :data-dir="trend">{{ trend === 'up' ? '↑ building' : trend === 'down' ? '↓ easing' : '· steady' }}</span>
							</p>
							<div class="mirror__stats">
								<span><b>{{ data.momentum.score }}</b> score</span>
								<span><b>{{ data.momentum.streak }}</b> day streak</span>
								<span><b>{{ data.momentum.totalTasksCompleted }}</b> done</span>
							</div>
						</div>
					</div>

					<p class="mirror__foot">A reflection, not a verdict. You decide what it means.</p>
				</template>
			</div>
		</div>
	</div>
</template>

<style scoped>
.mirror { flex: 1; min-width: 0; overflow: hidden; display: flex; }
.mirror__scroll { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 6px clamp(16px, 4vw, 40px); scrollbar-width: none; }
.mirror__scroll::-webkit-scrollbar { display: none; }
.mirror__wrap { max-width: 640px; margin: 0 auto; padding: 8px 0 24px; }

.mirror__intro { text-align: center; margin-bottom: 18px; }
.mirror__eyebrow { margin: 0 0 6px; font-size: 10.5px; letter-spacing: .2em; text-transform: uppercase; color: rgba(238,242,248,.5); }
.mirror__lede { margin: 0; font-family: 'Iowan Old Style', Palatino, Georgia, serif; font-size: clamp(16px, 2.3vw, 20px); line-height: 1.4; color: rgba(238,242,248,.86); text-wrap: balance; }

.mirror__state { text-align: center; color: rgba(238,242,248,.6); font-size: 14px; padding: 40px 12px; line-height: 1.6; }
.mirror__retry { margin-left: 8px; color: #eef2f8; text-decoration: underline; background: none; border: 0; cursor: pointer; font: inherit; }

/* Earnest's read — the hero */
.mirror__read { margin: 0 auto 20px; max-width: 560px; text-align: center; }
.mirror__read-text {
	margin: 0; font-family: 'Iowan Old Style', Palatino, Georgia, serif;
	font-size: clamp(17px, 2.6vw, 22px); line-height: 1.5; color: rgba(238,242,248,.96); text-wrap: balance;
}
.mirror__read-thinking { margin: 0; font-size: 14px; color: rgba(238,242,248,.5); display: inline-flex; align-items: center; gap: 7px; }
.read-enter-active, .read-leave-active { transition: opacity .5s ease, transform .5s ease; }
.read-enter-from { opacity: 0; transform: translateY(8px); }
.read-leave-to { opacity: 0; }
.mirror__dots { display: inline-flex; gap: 4px; }
.mirror__dots span { width: 5px; height: 5px; border-radius: 50%; background: rgba(238,242,248,.6); animation: mdots 1.1s ease-in-out infinite; }
.mirror__dots span:nth-child(2) { animation-delay: .15s; }
.mirror__dots span:nth-child(3) { animation-delay: .3s; }
@keyframes mdots { 0%,80%,100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-3px); opacity: 1; } }

/* Insight cards */
.mirror__insights { display: flex; flex-direction: column; gap: 11px; margin-bottom: 22px; }
.mirror__insight {
	border-radius: 18px; padding: 15px 17px;
	border: 1px solid rgba(238,242,248,.11); background: rgba(255,255,255,.045);
	border-left: 3px solid var(--k, rgba(238,242,248,.3));
	backdrop-filter: blur(16px);
	animation: m-rise .5s cubic-bezier(.2,.7,.2,1) both;
}
.mirror__insight[data-kind="avoidance"] { --k: #e2a15a; }
.mirror__insight[data-kind="overdue"] { --k: #e0757a; }
.mirror__insight[data-kind="outlier"] { --k: #d9b45a; }
.mirror__insight[data-kind="latency"] { --k: #5aa8d9; }
.mirror__insight:nth-child(2) { animation-delay: .06s; }
.mirror__insight:nth-child(3) { animation-delay: .12s; }
.mirror__insight:nth-child(4) { animation-delay: .18s; }
@keyframes m-rise { 0% { opacity: 0; transform: translateY(12px); filter: blur(5px); } 100% { opacity: 1; transform: none; filter: blur(0); } }

.mirror__insight-head { margin: 0 0 4px; font-size: 15px; line-height: 1.4; color: rgba(238,242,248,.95); font-weight: 500; }
.mirror__insight-ev { margin: 0 0 10px; font-size: 13px; line-height: 1.45; color: rgba(238,242,248,.6); }
.mirror__lever {
	display: inline-flex; align-items: center; gap: 5px;
	padding: 6px 13px; border-radius: 999px;
	border: 1px solid color-mix(in oklab, var(--k), transparent 55%);
	background: color-mix(in oklab, var(--k), transparent 86%);
	color: color-mix(in oklab, var(--k), white 22%);
	font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
	transition: background .2s ease, transform .15s ease;
}
.mirror__lever:hover { background: color-mix(in oklab, var(--k), transparent 76%); }
.mirror__lever:active { transform: scale(.96); }

/* By the numbers */
.mirror__numbers { display: grid; gap: 14px; grid-template-columns: 1fr; margin-bottom: 18px; }
@media (min-width: 520px) { .mirror__numbers { grid-template-columns: 1fr 1fr; } }
.mirror__num-block { border-radius: 16px; padding: 13px 15px; border: 1px solid rgba(238,242,248,.09); background: rgba(255,255,255,.03); }
.mirror__num-label { margin: 0 0 9px; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: rgba(238,242,248,.5); display: flex; align-items: center; justify-content: space-between; }
.mirror__trend { font-size: 10px; letter-spacing: normal; text-transform: none; color: rgba(238,242,248,.5); }
.mirror__trend[data-dir="up"] { color: #7fd6a6; }
.mirror__trend[data-dir="down"] { color: #e2b07f; }
.mirror__week { display: flex; align-items: flex-end; gap: 5px; height: 46px; }
.mirror__day { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; height: 100%; }
.mirror__day-track { flex: 1; width: 100%; display: flex; align-items: flex-end; }
.mirror__day-bar { width: 100%; min-height: 3px; border-radius: 3px; background: rgba(238,242,248,.2); }
.mirror__day-bar.is-peak { background: linear-gradient(180deg, #7fd6a6, #3fa982); }
.mirror__day-lab { font-size: 9px; color: rgba(238,242,248,.4); }
.mirror__num-note { margin: 8px 0 0; font-size: 11.5px; color: rgba(238,242,248,.55); }
.mirror__stats { display: flex; gap: 16px; }
.mirror__stats span { font-size: 11px; color: rgba(238,242,248,.55); }
.mirror__stats b { display: block; font-size: 19px; font-weight: 600; color: #fff; line-height: 1.1; }

.mirror__foot { text-align: center; margin: 8px 0 0; font-size: 12px; color: rgba(238,242,248,.4); font-style: italic; }

@media (prefers-reduced-motion: reduce) {
	.mirror__insight { animation: none !important; }
	.mirror__dots span { animation: none; }
}
</style>
