<script setup lang="ts">
/**
 * FocusNudge — a quiet, fatigue-aware invitation into Earnest's Focus mode.
 *
 * When the board gets heavy (a lot of urgent/high items asking for the user at
 * once), Earnest offers a calmer way through instead of adding to the pile. It's
 * deliberately unhurried: it waits a few seconds after the load crosses the
 * threshold (observed, not reactive), appears once, and stays gone for the rest
 * of the day when dismissed. Never blocks; never nags.
 *
 * Pass the current attention `load` (e.g. count of urgent/high priority items)
 * and an optional coaching `scope`. Teleports itself; drop it anywhere.
 */
import type { CoachingScope } from '~/composables/useCoachingMode';

const props = withDefaults(defineProps<{
	load: number;
	threshold?: number;
	scope?: CoachingScope | null;
}>(), { threshold: 6, scope: null });

const { open, isOpen } = useCoachingMode();
const reduceMotion = import.meta.client ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

// Dismissed for the rest of the working day (not per-render, not forever).
const dismissed = useCookie<string | null>('earnest-focus-nudge-dismissed', {
	maxAge: 60 * 60 * 10,
	default: () => null,
	sameSite: 'lax',
});

const revealed = ref(false);
let revealTimer: ReturnType<typeof setTimeout> | null = null;

const ready = computed(() => props.load >= props.threshold && !dismissed.value && !isOpen.value);

watch(ready, (isReady) => {
	if (isReady && !revealed.value) {
		// A considered pause — Earnest noticing, not pouncing.
		revealTimer = setTimeout(() => { revealed.value = true; }, reduceMotion ? 0 : 3500);
	} else if (!isReady) {
		if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
		revealed.value = false;
	}
}, { immediate: true });

function enter() {
	revealed.value = false;
	open(props.scope ?? { mode: 'org' });
}
function dismiss() {
	revealed.value = false;
	dismissed.value = new Date().toISOString();
}

onBeforeUnmount(() => { if (revealTimer) clearTimeout(revealTimer); });
</script>

<template>
	<Teleport to="body">
		<div v-if="revealed" class="focus-nudge" role="dialog" aria-label="A calmer way through">
			<div class="focus-nudge__glow" aria-hidden="true" />
			<EarnestMascot :size="30" class="shrink-0" />
			<div class="focus-nudge__body">
				<p class="focus-nudge__line">That's a lot to hold at once.</p>
				<p class="focus-nudge__sub">Step into Focus and take it one honest thing at a time.</p>
				<div class="focus-nudge__actions">
					<button type="button" class="focus-nudge__go" @click="enter">
						<Icon name="lucide:aperture" class="w-3.5 h-3.5" />
						Enter Focus
					</button>
					<button type="button" class="focus-nudge__later" @click="dismiss">Not now</button>
				</div>
			</div>
			<button type="button" class="focus-nudge__x" aria-label="Dismiss" @click="dismiss">
				<Icon name="lucide:x" class="w-3.5 h-3.5" />
			</button>
		</div>
	</Teleport>
</template>

<style scoped>
/* App design tokens are stored as raw HSL channel triplets (shadcn
   convention), so every colour must be wrapped in hsl(var(--token)). */
.focus-nudge {
	position: fixed;
	left: 50%;
	bottom: max(20px, env(safe-area-inset-bottom));
	transform: translateX(-50%);
	z-index: 70;
	display: flex;
	align-items: flex-start;
	gap: 12px;
	width: min(420px, calc(100vw - 28px));
	padding: 14px 16px;
	border-radius: 20px;
	border: 1px solid hsl(var(--border, 0 0% 50% / 0.2));
	background: hsl(var(--card, 0 0% 100%));
	color: hsl(var(--foreground, 0 0% 9%));
	box-shadow: 0 24px 60px -24px rgba(0, 0, 0, .5), 0 0 0 1px rgba(255, 255, 255, .04);
	backdrop-filter: blur(18px);
	overflow: hidden;
	animation: focus-nudge-in .6s cubic-bezier(.2, .7, .2, 1) both;
}
.focus-nudge__glow {
	position: absolute;
	inset: -40% -20% auto -20%;
	height: 120%;
	background: radial-gradient(60% 80% at 18% 0%, hsl(var(--primary, 196 100% 50%) / 0.22), transparent 70%);
	pointer-events: none;
}
.focus-nudge__body { position: relative; min-width: 0; flex: 1; }
.focus-nudge__line { margin: 0; font-size: 14px; font-weight: 600; color: hsl(var(--foreground, 0 0% 9%)); }
.focus-nudge__sub { margin: 2px 0 0; font-size: 12.5px; line-height: 1.45; color: hsl(var(--muted-foreground, 0 0% 45%)); }
.focus-nudge__actions { display: flex; align-items: center; gap: 8px; margin-top: 11px; }
.focus-nudge__go {
	display: inline-flex; align-items: center; gap: 6px;
	height: 32px; padding: 0 14px; border: 0; border-radius: 999px; cursor: pointer;
	font: inherit; font-size: 12.5px; font-weight: 600;
	color: hsl(var(--primary-foreground, 0 0% 100%));
	background: hsl(var(--primary, 196 100% 50%));
	transition: transform .15s, filter .15s;
}
.focus-nudge__go:hover { transform: translateY(-1px); filter: brightness(1.05); }
.focus-nudge__go:active { transform: scale(.97); }
.focus-nudge__later {
	height: 32px; padding: 0 10px; border: 0; background: transparent; cursor: pointer;
	font: inherit; font-size: 12.5px; color: hsl(var(--muted-foreground, 0 0% 45%));
	border-radius: 999px; transition: color .15s;
}
.focus-nudge__later:hover { color: hsl(var(--foreground, 0 0% 9%)); }
.focus-nudge__x {
	position: absolute; top: 8px; right: 8px;
	width: 26px; height: 26px; border: 0; border-radius: 50%; cursor: pointer;
	display: grid; place-items: center; background: transparent;
	color: hsl(var(--muted-foreground, 0 0% 45%)); transition: background .15s, color .15s;
}
.focus-nudge__x:hover { background: hsl(var(--muted, 0 0% 96%)); color: hsl(var(--foreground, 0 0% 9%)); }

@keyframes focus-nudge-in {
	0% { opacity: 0; transform: translateX(-50%) translateY(18px) scale(.96); filter: blur(6px); }
	100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); filter: blur(0); }
}
@media (prefers-reduced-motion: reduce) {
	.focus-nudge { animation: none; }
}
</style>
