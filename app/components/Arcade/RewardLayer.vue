<template>
	<Teleport to="body">
		<div class="arcade-layer" aria-hidden="true">
			<!-- Floating "+EP" coin pops — rise from bottom-center -->
			<div class="arcade-pops">
				<div
					v-for="pop in pops"
					:key="pop.id"
					class="arcade-pop"
					:style="popStyle(pop)"
				>
					<span class="arcade-pop__icon">{{ pop.icon || '⚡' }}</span>
					<span class="arcade-pop__ep">+{{ pop.ep }}</span>
					<span class="arcade-pop__label">{{ pop.label }}</span>
					<span v-if="pop.amount" class="arcade-pop__amount">{{ formatMoney(pop.amount) }}</span>
				</div>
			</div>

			<!-- Combo meter -->
			<Transition name="arcade-combo">
				<div v-if="combo >= 2" :key="combo" class="arcade-combo">
					<span class="arcade-combo__x">COMBO</span>
					<span class="arcade-combo__n">×{{ combo }}</span>
				</div>
			</Transition>

			<!-- Badge unlock toasts (top-right) -->
			<div class="arcade-badges">
				<TransitionGroup name="arcade-badge">
					<div v-for="b in badgeToasts" :key="b.id" class="arcade-badge">
						<div class="arcade-badge__medal">
							<UIcon :name="b.icon || 'i-heroicons-trophy'" class="size-5" />
						</div>
						<div class="arcade-badge__body">
							<div class="arcade-badge__eyebrow">Badge unlocked</div>
							<div class="arcade-badge__name">{{ b.name }}</div>
							<div class="arcade-badge__desc">{{ b.description }}</div>
						</div>
					</div>
				</TransitionGroup>
			</div>

			<!-- Level-up takeover -->
			<Transition name="arcade-levelup">
				<div v-if="levelUp" class="arcade-levelup">
					<div class="arcade-levelup__card">
						<div class="arcade-levelup__eyebrow">Level up</div>
						<div class="arcade-levelup__level">{{ levelUp.level }}</div>
						<div class="arcade-levelup__title">{{ levelUp.title }}</div>
						<div class="arcade-levelup__rays" />
					</div>
				</div>
			</Transition>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import type { ArcadePop } from '~/composables/useArcade';

const { pops, combo, badgeToasts, levelUp, dimensionColor } = useArcade();

// Deterministic horizontal jitter per pop so stacked pops fan out a touch.
function popStyle(pop: ArcadePop) {
	const jitter = ((pop.id * 37) % 120) - 60; // -60..60 px
	return {
		'--pop-color': dimensionColor(pop.dimension),
		'--pop-x': `${jitter}px`,
	} as Record<string, string>;
}

function formatMoney(n: number) {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0,
	}).format(n);
}
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.arcade-layer {
	position: fixed;
	inset: 0;
	z-index: 80;
	pointer-events: none;
	overflow: hidden;
}

/* ── Coin pops ─────────────────────────────────────────────────────────── */
.arcade-pops {
	position: absolute;
	left: 50%;
	bottom: clamp(80px, 18vh, 200px);
	transform: translateX(-50%);
	width: 0;
	display: flex;
	justify-content: center;
}

.arcade-pop {
	position: absolute;
	left: 0;
	bottom: 0;
	transform: translateX(-50%);
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	white-space: nowrap;
	padding: 0.4rem 0.85rem;
	border-radius: 9999px;
	font-weight: 700;
	color: white;
	background: color-mix(in srgb, var(--pop-color) 92%, black 8%);
	box-shadow:
		0 6px 20px -4px color-mix(in srgb, var(--pop-color) 60%, transparent),
		0 0 0 1px color-mix(in srgb, white 30%, transparent) inset;
	animation: arcade-float 1.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

.arcade-pop__icon {
	font-size: 1.05rem;
	line-height: 1;
}
.arcade-pop__ep {
	font-size: 1rem;
	font-variant-numeric: tabular-nums;
	letter-spacing: -0.02em;
}
.arcade-pop__label {
	font-size: 0.72rem;
	font-weight: 600;
	opacity: 0.9;
}
.arcade-pop__amount {
	font-size: 0.72rem;
	font-weight: 700;
	padding-left: 0.35rem;
	margin-left: 0.15rem;
	border-left: 1px solid color-mix(in srgb, white 40%, transparent);
}

@keyframes arcade-float {
	0% {
		transform: translateX(calc(-50% + var(--pop-x))) translateY(20px) scale(0.6);
		opacity: 0;
	}
	14% {
		transform: translateX(calc(-50% + var(--pop-x))) translateY(0) scale(1.08);
		opacity: 1;
	}
	26% {
		transform: translateX(calc(-50% + var(--pop-x))) translateY(-6px) scale(1);
	}
	100% {
		transform: translateX(calc(-50% + var(--pop-x))) translateY(-120px) scale(0.92);
		opacity: 0;
	}
}

/* ── Combo meter ───────────────────────────────────────────────────────── */
.arcade-combo {
	position: absolute;
	left: 50%;
	bottom: clamp(150px, 30vh, 320px);
	transform: translateX(-50%);
	display: inline-flex;
	align-items: baseline;
	gap: 0.35rem;
	padding: 0.3rem 0.9rem;
	border-radius: 9999px;
	background: linear-gradient(120deg, #f59e0b, #ef4444);
	color: white;
	font-weight: 800;
	text-transform: uppercase;
	box-shadow: 0 8px 24px -6px rgba(239, 68, 68, 0.6);
}
.arcade-combo__x {
	font-size: 0.7rem;
	letter-spacing: 0.12em;
	opacity: 0.9;
}
.arcade-combo__n {
	font-size: 1.15rem;
	font-variant-numeric: tabular-nums;
}
.arcade-combo-enter-active {
	animation: arcade-combo-pop 0.4s cubic-bezier(0.22, 1.4, 0.36, 1);
}
.arcade-combo-leave-active {
	transition: opacity 0.25s ease, transform 0.25s ease;
}
.arcade-combo-leave-to {
	opacity: 0;
	transform: translateX(-50%) scale(0.8);
}
@keyframes arcade-combo-pop {
	0% {
		transform: translateX(-50%) scale(0.4) rotate(-6deg);
		opacity: 0;
	}
	60% {
		transform: translateX(-50%) scale(1.15) rotate(2deg);
		opacity: 1;
	}
	100% {
		transform: translateX(-50%) scale(1) rotate(0);
	}
}

/* ── Badge toasts ──────────────────────────────────────────────────────── */
.arcade-badges {
	position: absolute;
	top: 68px;
	right: 16px;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	width: min(320px, calc(100vw - 32px));
}
.arcade-badge {
	pointer-events: auto;
	display: flex;
	gap: 0.7rem;
	align-items: center;
	padding: 0.7rem 0.8rem;
	border-radius: 1rem;
	background: color-mix(in srgb, var(--color-card, #fff) 88%, transparent);
	backdrop-filter: blur(12px) saturate(1.4);
	border: 1px solid color-mix(in srgb, #f59e0b 40%, transparent);
	box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.35);
}
.arcade-badge__medal {
	flex-shrink: 0;
	width: 2.4rem;
	height: 2.4rem;
	border-radius: 9999px;
	display: grid;
	place-items: center;
	color: white;
	background: linear-gradient(135deg, #fbbf24, #f59e0b);
	box-shadow: 0 0 0 3px color-mix(in srgb, #f59e0b 25%, transparent);
}
.arcade-badge__eyebrow {
	font-size: 0.6rem;
	text-transform: uppercase;
	letter-spacing: 0.1em;
	font-weight: 700;
	color: #f59e0b;
}
.arcade-badge__name {
	font-size: 0.9rem;
	font-weight: 700;
	color: var(--color-foreground, #111);
}
.arcade-badge__desc {
	font-size: 0.72rem;
	color: color-mix(in srgb, var(--color-foreground, #111) 60%, transparent);
	line-height: 1.2;
}
.arcade-badge-enter-active {
	transition: all 0.4s cubic-bezier(0.36, 0.66, 0.04, 1);
}
.arcade-badge-leave-active {
	transition: all 0.35s ease;
	position: absolute;
}
.arcade-badge-enter-from,
.arcade-badge-leave-to {
	opacity: 0;
	transform: translateX(30px) scale(0.9);
}

/* ── Level-up takeover ─────────────────────────────────────────────────── */
.arcade-levelup {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	background: radial-gradient(
		ellipse at center,
		rgba(0, 0, 0, 0.55) 0%,
		rgba(0, 0, 0, 0.35) 45%,
		transparent 75%
	);
}
.arcade-levelup__card {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: 2rem 3rem;
	color: white;
	text-align: center;
}
.arcade-levelup__eyebrow {
	font-size: 0.85rem;
	text-transform: uppercase;
	letter-spacing: 0.35em;
	font-weight: 700;
	color: #fbbf24;
	text-shadow: 0 2px 12px rgba(245, 158, 11, 0.6);
}
.arcade-levelup__level {
	font-size: clamp(4rem, 18vw, 7rem);
	font-weight: 900;
	line-height: 1;
	background: linear-gradient(160deg, #fde68a, #f59e0b, #ef4444);
	-webkit-background-clip: text;
	background-clip: text;
	-webkit-text-fill-color: transparent;
	filter: drop-shadow(0 4px 24px rgba(245, 158, 11, 0.55));
}
.arcade-levelup__title {
	font-size: clamp(1.4rem, 5vw, 2.2rem);
	font-weight: 800;
	letter-spacing: 0.02em;
	text-shadow: 0 2px 20px rgba(0, 0, 0, 0.6);
}
.arcade-levelup__rays {
	position: absolute;
	inset: -40% -60%;
	z-index: -1;
	background: conic-gradient(
		from 0deg,
		transparent 0deg,
		rgba(245, 158, 11, 0.14) 12deg,
		transparent 24deg,
		transparent 36deg,
		rgba(245, 158, 11, 0.14) 48deg,
		transparent 60deg
	);
	animation: arcade-spin 8s linear infinite;
}
@keyframes arcade-spin {
	to {
		transform: rotate(360deg);
	}
}
.arcade-levelup-enter-active .arcade-levelup__card {
	animation: arcade-levelup-in 0.6s cubic-bezier(0.22, 1.3, 0.36, 1);
}
.arcade-levelup-enter-active,
.arcade-levelup-leave-active {
	transition: opacity 0.4s ease;
}
.arcade-levelup-enter-from,
.arcade-levelup-leave-to {
	opacity: 0;
}
@keyframes arcade-levelup-in {
	0% {
		transform: scale(0.5) translateY(30px);
		opacity: 0;
	}
	60% {
		transform: scale(1.08);
		opacity: 1;
	}
	100% {
		transform: scale(1);
	}
}

@media (prefers-reduced-motion: reduce) {
	.arcade-pop,
	.arcade-combo-enter-active,
	.arcade-levelup__rays,
	.arcade-levelup-enter-active .arcade-levelup__card {
		animation-duration: 0.001s !important;
	}
	.arcade-pop {
		animation: arcade-fade 1.6s linear forwards;
	}
	@keyframes arcade-fade {
		0%,
		80% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}
}
</style>
