<script setup lang="ts">
/**
 * <EarnestMirror> — the Learning surface: a calm, READ-ONLY reflection of how
 * you actually work, shown inside Focus mode. It reflects, it never advises.
 *
 * The server route (/api/mirror/me) is a thin data provider; the honest reading
 * happens here so rhythm + ages land in the user's LOCAL timezone:
 *   · Momentum — your Earnest Score, streak, and 30-day trend.
 *   · Rhythm   — when you actually close work (weekday + time-of-day), from raw
 *                completion timestamps.
 *   · Sitting  — the open work that's been waiting longest (an honest nudge).
 *   · Themes   — what you keep returning to in your notes.
 *
 * Presence language: quiet cards over the aura, a serif reflective line per
 * section, no charts-as-scoreboard. Speaks in Earnest's voice — present, honest,
 * never preachy.
 */
const props = defineProps<{ active: boolean }>();

const { selectedOrg } = useOrganization();

interface MirrorData {
	generatedAt: string;
	momentum: null | {
		score: number; streak: number; bestStreak: number; level: number;
		daysActiveThisWeek: number; totalTasksCompleted: number; lastActivityDate: string | null;
	};
	history: Array<{ date: string; score: number }>;
	completions: string[];
	sitting: Array<{ id: string; title: string; schedule: string | null; created: string | null }>;
	themes: { noteCount: number; tags: Array<{ name: string; count: number }>; recentTitles: string[] };
}

const data = ref<MirrorData | null>(null);
const loading = ref(false);
const errored = ref(false);
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
	} catch {
		errored.value = true;
	} finally {
		loading.value = false;
	}
}

// Lazy: only reach for the data when the Mirror is actually shown.
watch(() => props.active, (on) => { if (on) load(); }, { immediate: true });

// ── Local-timezone reading of the raw data ───────────────────────────────────
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
type Bucket = 'morning' | 'afternoon' | 'evening' | 'night';
function bucketOf(hour: number): Bucket {
	if (hour >= 5 && hour < 12) return 'morning';
	if (hour >= 12 && hour < 17) return 'afternoon';
	if (hour >= 17 && hour < 22) return 'evening';
	return 'night';
}

const rhythm = computed(() => {
	const c = data.value?.completions ?? [];
	const byWeekday = [0, 0, 0, 0, 0, 0, 0];
	const byBucket: Record<Bucket, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
	const now = Date.now();
	let last7 = 0, last30 = 0;
	for (const iso of c) {
		const d = new Date(iso);
		const t = d.getTime();
		if (Number.isNaN(t)) continue;
		byWeekday[d.getDay()] = (byWeekday[d.getDay()] ?? 0) + 1;
		byBucket[bucketOf(d.getHours())]++;
		if (t >= now - 7 * 86400000) last7++;
		if (t >= now - 30 * 86400000) last30++;
	}
	const total = c.length;
	const peakWeekdayIdx = total ? byWeekday.indexOf(Math.max(...byWeekday)) : -1;
	const peakBucketEntry = total
		? (Object.entries(byBucket) as Array<[Bucket, number]>).reduce((a, b) => (b[1] > a[1] ? b : a))
		: null;
	const maxWeekday = Math.max(1, ...byWeekday);
	return {
		total, last7, last30, byWeekday, byBucket, maxWeekday,
		peakWeekday: peakWeekdayIdx >= 0 ? WEEKDAYS[peakWeekdayIdx] : null,
		peakBucket: peakBucketEntry && peakBucketEntry[1] > 0 ? peakBucketEntry[0] : null,
	};
});

const trend = computed(() => {
	const h = data.value?.history ?? [];
	if (h.length < 4) return { dir: 'flat' as 'up' | 'down' | 'flat', points: h };
	const third = Math.max(1, Math.floor(h.length / 3));
	const avg = (arr: typeof h) => arr.reduce((s, r) => s + r.score, 0) / arr.length;
	const early = avg(h.slice(0, third));
	const late = avg(h.slice(-third));
	const dir = late > early + 1.5 ? 'up' : late < early - 1.5 ? 'down' : 'flat';
	return { dir, points: h };
});

// A tiny sparkline path for the trend (0..100 → viewBox 100×28).
const sparkPath = computed(() => {
	const pts = trend.value.points;
	if (pts.length < 2) return '';
	const n = pts.length;
	return pts
		.map((p, i) => {
			const x = (i / (n - 1)) * 100;
			const y = 28 - (Math.max(0, Math.min(100, p.score)) / 100) * 26 - 1;
			return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(' ');
});

function ageDays(created: string | null): number | null {
	if (!created) return null;
	const t = new Date(created).getTime();
	if (Number.isNaN(t)) return null;
	return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}
function ageLabel(created: string | null): string {
	const d = ageDays(created);
	if (d === null) return '';
	if (d === 0) return 'today';
	if (d === 1) return '1 day';
	if (d < 30) return `${d} days`;
	const w = Math.round(d / 7);
	return `${w} weeks`;
}
const oldestSitting = computed(() => {
	const s = data.value?.sitting ?? [];
	return s.length ? { ...s[0]!, days: ageDays(s[0]!.created) } : null;
});

// ── Reflective lines — Earnest's voice, composed from the numbers ────────────
const momentumLine = computed(() => {
	const m = data.value?.momentum;
	if (!m) return 'Your momentum hasn\'t started keeping score yet — that\'s fine. It begins the moment you do.';
	const bits: string[] = [];
	if (m.streak >= 2) bits.push(`You're on a ${m.streak}-day streak`);
	else bits.push('You showed up today');
	if (trend.value.dir === 'up') bits.push('and your rhythm is building');
	else if (trend.value.dir === 'down') bits.push('though things have eased off lately');
	return bits.join(' ') + '.';
});
const rhythmLine = computed(() => {
	const r = rhythm.value;
	if (!r.total) return 'Not much closed work to reflect yet — come back after a few more are done.';
	if (r.peakWeekday && r.peakBucket) {
		return `You close the most on ${r.peakWeekday}s, usually in the ${r.peakBucket}.`;
	}
	return `You've closed ${r.total} tasks in the last 60 days.`;
});
const themesLine = computed(() => {
	const t = data.value?.themes;
	if (!t || !t.tags.length) {
		if (t && t.noteCount) return `You've kept ${t.noteCount} notes — no clear thread yet.`;
		return 'Nothing saved to your notes yet — that\'s where your threads will show.';
	}
	const names = t.tags.slice(0, 2).map((x) => x.name);
	return `You keep returning to ${names.join(' and ')}.`;
});

const hasAnything = computed(() => {
	const d = data.value;
	if (!d) return false;
	return !!d.momentum || d.completions.length > 0 || d.sitting.length > 0 || d.themes.noteCount > 0;
});
</script>

<template>
	<div class="mirror">
		<div class="mirror__scroll">
			<div class="mirror__wrap">
				<header class="mirror__intro">
					<p class="mirror__eyebrow">The Mirror</p>
					<p class="mirror__lede">Not a scoreboard — just an honest look at how you actually work.</p>
				</header>

				<div v-if="loading && !data" class="mirror__state">Looking back over your work…</div>
				<div v-else-if="errored" class="mirror__state">
					I couldn't gather your reflection just now.
					<button type="button" class="mirror__retry" @click="load(true)">Try again</button>
				</div>
				<div v-else-if="data && !hasAnything" class="mirror__state">
					There's not much to reflect yet. Do a little good work and come back — I'll show you your patterns.
				</div>

				<div v-else-if="data" class="mirror__cards">
					<!-- Momentum -->
					<section class="mirror__card">
						<div class="mirror__card-head">
							<span class="mirror__card-title">Momentum</span>
							<span v-if="data.momentum" class="mirror__trend" :data-dir="trend.dir">
								<Icon
									:name="trend.dir === 'up' ? 'lucide:trending-up' : trend.dir === 'down' ? 'lucide:trending-down' : 'lucide:minus'"
									class="w-3 h-3"
								/>
								{{ trend.dir === 'up' ? 'building' : trend.dir === 'down' ? 'easing' : 'steady' }}
							</span>
						</div>
						<p class="mirror__reflect">{{ momentumLine }}</p>
						<div v-if="data.momentum" class="mirror__stats">
							<div class="mirror__stat"><b>{{ data.momentum.score }}</b><span>score</span></div>
							<div class="mirror__stat"><b>{{ data.momentum.streak }}</b><span>day streak</span></div>
							<div class="mirror__stat"><b>{{ data.momentum.daysActiveThisWeek }}</b><span>days this week</span></div>
							<div class="mirror__stat"><b>{{ data.momentum.totalTasksCompleted }}</b><span>done, all time</span></div>
						</div>
						<svg v-if="sparkPath" class="mirror__spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
							<path :d="sparkPath" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					</section>

					<!-- Rhythm -->
					<section class="mirror__card">
						<div class="mirror__card-head">
							<span class="mirror__card-title">Your rhythm</span>
							<span v-if="rhythm.total" class="mirror__muted">{{ rhythm.last30 }} in 30 days</span>
						</div>
						<p class="mirror__reflect">{{ rhythmLine }}</p>
						<div v-if="rhythm.total" class="mirror__week" aria-hidden="true">
							<div v-for="(n, i) in rhythm.byWeekday" :key="i" class="mirror__day">
								<div class="mirror__day-bar-track">
									<div
										class="mirror__day-bar"
										:class="{ 'is-peak': rhythm.peakWeekday === WEEKDAYS[i] && n > 0 }"
										:style="{ height: Math.round((n / rhythm.maxWeekday) * 100) + '%' }"
									/>
								</div>
								<span class="mirror__day-label">{{ WEEKDAYS_SHORT[i] }}</span>
							</div>
						</div>
					</section>

					<!-- Sitting -->
					<section v-if="data.sitting.length" class="mirror__card">
						<div class="mirror__card-head">
							<span class="mirror__card-title">What's been sitting</span>
							<span class="mirror__muted">{{ data.sitting.length }} open</span>
						</div>
						<p class="mirror__reflect">
							<template v-if="oldestSitting && oldestSitting.days !== null && oldestSitting.days >= 3">
								“{{ oldestSitting.title }}” has waited {{ ageLabel(oldestSitting.created) }}. No judgment — just naming it.
							</template>
							<template v-else>A few things are open. When you're ready, the oldest are here.</template>
						</p>
						<ul class="mirror__sitting">
							<li v-for="t in data.sitting.slice(0, 5)" :key="t.id" class="mirror__sit">
								<span class="mirror__sit-title">{{ t.title }}</span>
								<span class="mirror__sit-age">{{ ageLabel(t.created) }}</span>
							</li>
						</ul>
					</section>

					<!-- Themes -->
					<section class="mirror__card">
						<div class="mirror__card-head">
							<span class="mirror__card-title">What you return to</span>
							<span v-if="data.themes.noteCount" class="mirror__muted">{{ data.themes.noteCount }} notes</span>
						</div>
						<p class="mirror__reflect">{{ themesLine }}</p>
						<div v-if="data.themes.tags.length" class="mirror__tags">
							<span v-for="tag in data.themes.tags" :key="tag.name" class="mirror__tag">
								{{ tag.name }}<i v-if="tag.count > 1">{{ tag.count }}</i>
							</span>
						</div>
					</section>
				</div>

				<p v-if="data" class="mirror__foot">A reflection, not a verdict. You decide what it means.</p>
			</div>
		</div>
	</div>
</template>

<style scoped>
.mirror { flex: 1; min-width: 0; overflow: hidden; display: flex; }
.mirror__scroll { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 6px clamp(16px, 4vw, 40px); scrollbar-width: none; }
.mirror__scroll::-webkit-scrollbar { display: none; }
.mirror__wrap { max-width: 620px; margin: 0 auto; padding: 8px 0 20px; }

.mirror__intro { text-align: center; margin-bottom: 22px; }
.mirror__eyebrow { margin: 0 0 6px; font-size: 10.5px; letter-spacing: .2em; text-transform: uppercase; color: rgba(238,242,248,.5); }
.mirror__lede { margin: 0; font-family: 'Iowan Old Style', Palatino, Georgia, serif; font-size: clamp(17px, 2.4vw, 21px); line-height: 1.4; color: rgba(238,242,248,.9); text-wrap: balance; }

.mirror__state { text-align: center; color: rgba(238,242,248,.6); font-size: 14px; padding: 40px 12px; line-height: 1.6; }
.mirror__retry { display: inline-block; margin-left: 8px; color: #eef2f8; text-decoration: underline; background: none; border: 0; cursor: pointer; font: inherit; }

.mirror__cards { display: grid; gap: 14px; grid-template-columns: 1fr; }
@media (min-width: 560px) { .mirror__cards { grid-template-columns: 1fr 1fr; } }

.mirror__card {
	border-radius: 20px; padding: 16px 18px;
	border: 1px solid rgba(238,242,248,.11); background: rgba(255,255,255,.045);
	backdrop-filter: blur(18px);
	animation: mirror-rise .55s cubic-bezier(.2,.7,.2,1) both;
	display: flex; flex-direction: column; gap: 10px;
}
.mirror__card:nth-child(2) { animation-delay: .06s; }
.mirror__card:nth-child(3) { animation-delay: .12s; }
.mirror__card:nth-child(4) { animation-delay: .18s; }
@keyframes mirror-rise { 0% { opacity: 0; transform: translateY(14px); filter: blur(6px); } 100% { opacity: 1; transform: none; filter: blur(0); } }

.mirror__card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mirror__card-title { font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: rgba(238,242,248,.55); }
.mirror__muted { font-size: 11px; color: rgba(238,242,248,.42); }
.mirror__trend { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: rgba(238,242,248,.5); }
.mirror__trend[data-dir="up"] { color: #7fd6a6; }
.mirror__trend[data-dir="down"] { color: #e2b07f; }

.mirror__reflect { margin: 0; font-family: 'Iowan Old Style', Palatino, Georgia, serif; font-size: 15px; line-height: 1.5; color: rgba(238,242,248,.92); }

.mirror__stats { display: flex; flex-wrap: wrap; gap: 14px 20px; margin-top: 2px; }
.mirror__stat { display: flex; flex-direction: column; line-height: 1.1; }
.mirror__stat b { font-size: 20px; font-weight: 600; color: #fff; }
.mirror__stat span { font-size: 10.5px; color: rgba(238,242,248,.5); margin-top: 2px; }
.mirror__spark { width: 100%; height: 26px; margin-top: 2px; color: rgba(127,214,166,.75); }

.mirror__week { display: flex; align-items: flex-end; gap: 6px; height: 62px; margin-top: 4px; }
.mirror__day { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; height: 100%; }
.mirror__day-bar-track { flex: 1; width: 100%; display: flex; align-items: flex-end; }
.mirror__day-bar { width: 100%; min-height: 3px; border-radius: 4px; background: rgba(238,242,248,.2); transition: height .4s cubic-bezier(.2,.7,.2,1); }
.mirror__day-bar.is-peak { background: linear-gradient(180deg, #7fd6a6, #3fa982); }
.mirror__day-label { font-size: 10px; color: rgba(238,242,248,.4); }

.mirror__sitting { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.mirror__sit { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.mirror__sit-title { font-size: 13.5px; color: rgba(238,242,248,.82); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mirror__sit-age { flex: none; font-size: 11px; color: rgba(238,242,248,.42); font-variant-numeric: tabular-nums; }

.mirror__tags { display: flex; flex-wrap: wrap; gap: 6px; }
.mirror__tag { display: inline-flex; align-items: center; gap: 5px; padding: 4px 11px; border-radius: 999px; border: 1px solid rgba(238,242,248,.14); background: rgba(255,255,255,.05); font-size: 12px; color: rgba(238,242,248,.85); }
.mirror__tag i { font-style: normal; font-size: 10px; color: rgba(238,242,248,.5); }

.mirror__foot { text-align: center; margin: 20px 0 4px; font-size: 12px; color: rgba(238,242,248,.4); font-style: italic; }

@media (prefers-reduced-motion: reduce) {
	.mirror__card { animation: none !important; }
	.mirror__day-bar { transition: none; }
}
</style>
