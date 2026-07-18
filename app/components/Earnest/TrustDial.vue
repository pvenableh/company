<script setup lang="ts">
/**
 * <EarnestTrustDial> — the Partner surface: a weighted dial you turn to grant
 * Earnest more autonomy. Trust that compounds into autonomy that grows.
 *
 * Drag the pointer around the gauge (GSAP Draggable, `type:'rotation'`) — it
 * settles onto the nearest notch with an elastic ease, never a linear snap.
 * The four notches are also plain buttons, so it's fully usable (and accessible)
 * without the drag. Committing a tier writes it through useAiAutonomy(); the
 * server enforces the hard safety floor regardless (email / money / meetings
 * always ask).
 */
import { gsap } from 'gsap';
import { ensureEarnestGsap } from '~/composables/useEarnestPresence';

const { tier, load, setTier, TIERS } = useAiAutonomy();
const { selectedOrg } = useOrganization();

// "Trust compounds" — count the actions this user has approved that Earnest ran
// cleanly (vs rejected), and nudge toward more autonomy once enough is earned.
const signal = ref<{ approved: number; rejected: number } | null>(null);
const NUDGE_THRESHOLD = [3, 10, 25] as const; // approvals to suggest leaving tier 0 / 1 / 2
async function loadSignal() {
	const organizationId = selectedOrg.value;
	if (!organizationId) return;
	try {
		signal.value = await $fetch('/api/ai/actions/trust', { query: { organizationId } });
	} catch {
		signal.value = null;
	}
}
const nudge = computed(() => {
	const s = signal.value;
	const t = clamp(tier.value);
	if (!s || t >= 3) return null;
	if (s.approved < NUDGE_THRESHOLD[t]!) return null;
	if (s.approved < s.rejected * 2) return null; // mostly-clean history only
	return { next: (t + 1) as number, nextInfo: TIERS[t + 1]!, approved: s.approved };
});

// Gauge geometry: four notches over a bottom-open 270° arc (0 = top, clockwise).
const ANGLES = [-135, -45, 45, 135] as const; // tier 0 → 3
const RADIUS = 40; // % of the ring for notch placement
const TIER_COLOR = ['#6b7280', '#38bdf8', '#22d3ee', '#4fd89a'] as const; // cool → alive as trust grows

const ringEl = ref<HTMLElement | null>(null);
const pointerEl = ref<HTMLElement | null>(null);
let drag: any = null;

// `preview` follows the pointer while dragging; the committed tier is `tier`.
const preview = ref(tier.value);
watch(tier, (t) => { preview.value = t; if (!dragging.value) rotateTo(t, true); });
const dragging = ref(false);

const shown = computed(() => TIERS[clamp(preview.value)]!);
const shownColor = computed(() => TIER_COLOR[clamp(preview.value)]);

function clamp(n: number) { return Math.max(0, Math.min(3, Math.round(n))); }
function notchXY(i: number) {
	const rad = (ANGLES[i]! * Math.PI) / 180;
	return { x: 50 + Math.sin(rad) * RADIUS, y: 50 - Math.cos(rad) * RADIUS };
}
function nearestTier(rotation: number) {
	return clamp((rotation + 135) / 90);
}
function rotateTo(t: number, immediate = false) {
	if (!pointerEl.value) return;
	const angle = ANGLES[clamp(t)]!;
	if (immediate || reduceMotion) gsap.set(pointerEl.value, { rotation: angle });
	else gsap.to(pointerEl.value, { rotation: angle, duration: 0.7, ease: 'elastic.out(1, 0.55)' });
}

let reduceMotion = false;

async function commit(t: number) {
	preview.value = clamp(t);
	rotateTo(preview.value);
	await setTier(preview.value);
}

async function wireDrag() {
	if (!pointerEl.value || reduceMotion) return;
	await ensureEarnestGsap(); // registers Draggable (free plugin)
	const Draggable = (gsap as any).Draggable ?? (await import('gsap/Draggable')).Draggable;
	if (!Draggable) return;
	drag = Draggable.create(pointerEl.value, {
		type: 'rotation',
		bounds: { minRotation: ANGLES[0], maxRotation: ANGLES[3] },
		onPress() { dragging.value = true; },
		onDrag() { preview.value = nearestTier(this.rotation); },
		onRelease() {
			dragging.value = false;
			const t = nearestTier(this.rotation);
			commit(t);
		},
	})[0];
}

onMounted(async () => {
	if (import.meta.client) reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	await load();
	preview.value = tier.value;
	rotateTo(tier.value, true);
	wireDrag();
	loadSignal();
});
onBeforeUnmount(() => { drag?.kill?.(); if (pointerEl.value) gsap.killTweensOf(pointerEl.value); });
</script>

<template>
	<div class="trustdial" :style="{ '--tier-color': shownColor }">
		<div ref="ringEl" class="trustdial__ring">
			<!-- arc track -->
			<svg class="trustdial__arc" viewBox="0 0 100 100" aria-hidden="true">
				<path d="M 21.72 78.28 A 40 40 0 1 1 78.28 78.28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="trustdial__arc-bg" />
			</svg>

			<!-- notches (also the accessible controls) -->
			<button
				v-for="(t, i) in TIERS"
				:key="t.tier"
				type="button"
				class="trustdial__notch"
				:data-on="preview === t.tier"
				:style="{ left: notchXY(i).x + '%', top: notchXY(i).y + '%' }"
				:aria-label="`${t.label} — tier ${t.tier}`"
				:aria-pressed="tier === t.tier"
				@click="commit(t.tier)"
			>
				<span class="trustdial__notch-dot" />
			</button>

			<!-- pointer -->
			<div ref="pointerEl" class="trustdial__pointer" aria-hidden="true">
				<span class="trustdial__pointer-line" />
				<span class="trustdial__knob" />
			</div>

			<!-- centre readout -->
			<div class="trustdial__center">
				<span class="trustdial__tier-num">{{ shown.tier }}</span>
				<span class="trustdial__tier-label">{{ shown.label }}</span>
			</div>
		</div>

		<p class="trustdial__blurb">{{ shown.blurb }}</p>
		<p class="trustdial__floor">
			<Icon name="lucide:shield-check" class="w-3 h-3" />
			Email, money &amp; meetings always ask first.
		</p>

		<!-- trust compounds: surfaced only once it's been earned -->
		<Transition name="td-nudge">
			<button v-if="nudge" type="button" class="trustdial__nudge" @click="commit(nudge.next)">
				<Icon name="lucide:trending-up" class="w-3.5 h-3.5 shrink-0 text-emerald-500" />
				<span>
					Earnest has handled <b>{{ nudge.approved }}</b> of your approvals cleanly.
					Trust it with more? <span class="trustdial__nudge-cta">Raise to “{{ nudge.nextInfo.label }}”</span>
				</span>
			</button>
		</Transition>
	</div>
</template>

<style scoped>
.trustdial {
	display: flex; flex-direction: column; align-items: center; gap: 10px;
	--tier-color: #38bdf8;
}
.trustdial__ring {
	position: relative;
	width: 176px; height: 176px;
	color: hsl(var(--border));
}
.trustdial__arc { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.trustdial__arc-bg { opacity: 0.4; }

.trustdial__notch {
	position: absolute; transform: translate(-50%, -50%);
	width: 34px; height: 34px; border-radius: 50%;
	display: grid; place-items: center;
	background: transparent; border: 0; cursor: pointer;
	-webkit-tap-highlight-color: transparent;
}
.trustdial__notch-dot {
	width: 10px; height: 10px; border-radius: 50%;
	background: hsl(var(--muted-foreground) / 0.35);
	transition: background 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease;
}
.trustdial__notch:hover .trustdial__notch-dot { background: hsl(var(--muted-foreground) / 0.6); }
.trustdial__notch[data-on="true"] .trustdial__notch-dot {
	background: var(--tier-color);
	transform: scale(1.35);
	box-shadow: 0 0 0 4px color-mix(in oklab, var(--tier-color), transparent 78%);
}

.trustdial__pointer {
	position: absolute; inset: 0;
	transform-origin: 50% 50%;
	pointer-events: auto; cursor: grab;
	touch-action: none;
}
.trustdial__pointer:active { cursor: grabbing; }
.trustdial__pointer-line {
	position: absolute; left: 50%; top: 12%;
	width: 2.5px; height: 26%;
	transform: translateX(-50%);
	border-radius: 999px;
	background: linear-gradient(to bottom, var(--tier-color), transparent);
}
.trustdial__knob {
	position: absolute; left: 50%; top: 12%;
	width: 16px; height: 16px; border-radius: 50%;
	transform: translate(-50%, -50%);
	background: var(--tier-color);
	box-shadow: 0 0 0 4px color-mix(in oklab, var(--tier-color), transparent 80%), 0 2px 8px rgba(0,0,0,0.25);
}

.trustdial__center {
	position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%);
	display: flex; flex-direction: column; align-items: center; gap: 2px;
	text-align: center; width: 84px; pointer-events: none;
}
.trustdial__tier-num {
	font-size: 34px; font-weight: 700; line-height: 1;
	color: var(--tier-color);
	transition: color 0.4s ease;
}
.trustdial__tier-label {
	font-size: 11px; font-weight: 600; color: hsl(var(--foreground));
	text-wrap: balance;
}

.trustdial__blurb {
	margin: 0; font-size: 12px; color: hsl(var(--muted-foreground));
	text-align: center; max-width: 220px; min-height: 2.4em; text-wrap: balance;
}
.trustdial__floor {
	margin: 0; display: inline-flex; align-items: center; gap: 5px;
	font-size: 10.5px; color: hsl(var(--muted-foreground) / 0.75);
}

.trustdial__nudge {
	margin-top: 2px; display: flex; align-items: flex-start; gap: 7px; text-align: left;
	max-width: 260px; padding: 9px 12px; border-radius: 14px;
	border: 1px solid color-mix(in oklab, var(--tier-color), transparent 70%);
	background: color-mix(in oklab, var(--tier-color), transparent 92%);
	font-size: 11.5px; line-height: 1.4; color: hsl(var(--foreground));
	cursor: pointer; transition: background 0.2s ease, border-color 0.2s ease;
}
.trustdial__nudge:hover { background: color-mix(in oklab, var(--tier-color), transparent 86%); }
.trustdial__nudge-cta { font-weight: 600; color: var(--tier-color); white-space: nowrap; }
.td-nudge-enter-active, .td-nudge-leave-active { transition: opacity 0.35s ease, transform 0.35s ease; }
.td-nudge-enter-from, .td-nudge-leave-to { opacity: 0; transform: translateY(6px); }

@media (prefers-reduced-motion: reduce) {
	.trustdial__notch-dot { transition: none; }
}
</style>
