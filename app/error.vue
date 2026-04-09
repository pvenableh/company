<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps({
	error: Object as () => NuxtError,
})

const statusCode = computed(() => props.error?.statusCode || 500)

const errorConfig: Record<number, { title: string; tagline: string; sub: string }> = {
	404: {
		title: 'Lost.',
		tagline: 'This page doesn\u2019t exist.',
		sub: 'It may have moved, or it was never here to begin with.',
	},
	403: {
		title: 'Private.',
		tagline: 'You don\u2019t have access.',
		sub: 'If you should, check with your team or sign in again.',
	},
	401: {
		title: 'Locked.',
		tagline: 'Authentication required.',
		sub: 'Sign in to continue where you left off.',
	},
	500: {
		title: 'Broken.',
		tagline: 'Something went wrong.',
		sub: 'It\u2019s not you \u2014 it\u2019s us. We\u2019re looking into it.',
	},
}

const config = computed(() => {
	return (
		errorConfig[statusCode.value] || {
			title: `${statusCode.value}.`,
			tagline: props.error?.message || 'An error occurred.',
			sub: 'Something unexpected happened. Try again or head home.',
		}
	)
})

const handleError = () => clearError({ redirect: '/' })
const goBack = () => {
	if (window.history.length > 1) {
		window.history.back()
	} else {
		clearError({ redirect: '/' })
	}
}
</script>

<template>
	<div class="error-page">
		<!-- Animated gradient blobs -->
		<div class="error-orb error-orb-1" />
		<div class="error-orb error-orb-2" />
		<div class="error-orb error-orb-3" />
		<div class="error-orb error-orb-4" />
		<div class="error-orb error-orb-5" />

		<div class="error-glass">
			<div class="error-content">
				<p class="error-kicker">Error {{ statusCode }}</p>
				<h1 class="error-title">{{ config.title }}</h1>
				<p class="error-tagline">{{ config.tagline }}</p>
				<p class="error-sub">{{ config.sub }}</p>

				<div class="error-actions">
					<button class="btn-primary" @click="handleError">Go home</button>
					<button class="btn-ghost" @click="goBack">Go back</button>
				</div>
			</div>
		</div>

		<div class="error-footer">
			<p class="error-footer-text">Earnest<span class="error-period">.</span></p>
		</div>
	</div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Gaegu:wght@300;400;700&display=swap');

.error-page {
	--blue: #007AFF;
	--blue-soft: rgba(0, 122, 255, 0.08);
	--glass-bg: rgba(255, 255, 255, 0.72);
	--glass-border: rgba(255, 255, 255, 0.5);
	--surface: #f5f5f7;
	--text: #1d1d1f;
	--text-2: #424245;
	--text-muted: #86868b;

	min-height: 100vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	background: var(--surface);
	color: var(--text);
	font-family: var(--font-proxima-regular, 'SF Pro Display', system-ui, sans-serif);
	-webkit-font-smoothing: antialiased;
	padding: 48px 24px;
	position: relative;
	overflow: hidden;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
	.error-page {
		--glass-bg: rgba(30, 30, 30, 0.72);
		--glass-border: rgba(255, 255, 255, 0.08);
		--surface: #000000;
		--text: #f5f5f7;
		--text-2: #a1a1a6;
		--text-muted: #6e6e73;
		--blue-soft: rgba(0, 122, 255, 0.12);
	}
}

/* Animated background blobs */
.error-orb {
	position: absolute;
	border-radius: 50%;
	filter: blur(80px);
	pointer-events: none;
	will-change: transform;
}
.error-orb-1 {
	width: 500px;
	height: 500px;
	background: #007AFF;
	top: -150px;
	right: -120px;
	opacity: 0.12;
	animation: float-1 12s ease-in-out infinite;
}
.error-orb-2 {
	width: 400px;
	height: 400px;
	background: #5856D6;
	bottom: -120px;
	left: -100px;
	opacity: 0.1;
	animation: float-2 15s ease-in-out infinite;
}
.error-orb-3 {
	width: 350px;
	height: 350px;
	background: #34C759;
	top: 30%;
	left: -160px;
	opacity: 0.06;
	animation: float-3 18s ease-in-out infinite;
}
.error-orb-4 {
	width: 280px;
	height: 280px;
	background: #FF9500;
	bottom: 10%;
	right: -80px;
	opacity: 0.07;
	animation: float-4 14s ease-in-out infinite;
}
.error-orb-5 {
	width: 220px;
	height: 220px;
	background: #AF52DE;
	top: 15%;
	right: 20%;
	opacity: 0.05;
	animation: float-5 20s ease-in-out infinite;
}

@keyframes float-1 {
	0%, 100% { transform: translate(0, 0) scale(1); }
	33% { transform: translate(-30px, 40px) scale(1.05); }
	66% { transform: translate(20px, -20px) scale(0.95); }
}
@keyframes float-2 {
	0%, 100% { transform: translate(0, 0) scale(1); }
	33% { transform: translate(40px, -30px) scale(1.08); }
	66% { transform: translate(-20px, 25px) scale(0.92); }
}
@keyframes float-3 {
	0%, 100% { transform: translate(0, 0) scale(1); }
	50% { transform: translate(50px, -40px) scale(1.1); }
}
@keyframes float-4 {
	0%, 100% { transform: translate(0, 0) scale(1); }
	40% { transform: translate(-35px, -25px) scale(1.06); }
	70% { transform: translate(15px, 30px) scale(0.94); }
}
@keyframes float-5 {
	0%, 100% { transform: translate(0, 0) scale(1); }
	50% { transform: translate(-25px, 35px) scale(1.12); }
}

/* Glass card — strong frosted effect */
.error-glass {
	background: rgba(255, 255, 255, 0.55);
	backdrop-filter: saturate(200%) blur(40px);
	-webkit-backdrop-filter: saturate(200%) blur(40px);
	border: 1px solid rgba(255, 255, 255, 0.6);
	border-radius: 28px;
	padding: 60px 48px;
	max-width: 520px;
	width: 100%;
	position: relative;
	z-index: 1;
	box-shadow:
		0 8px 32px rgba(0, 0, 0, 0.06),
		inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

@media (prefers-color-scheme: dark) {
	.error-glass {
		background: rgba(30, 30, 30, 0.5);
		border-color: rgba(255, 255, 255, 0.1);
		box-shadow:
			0 8px 32px rgba(0, 0, 0, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
	}
}

.error-content {
	text-align: center;
}

.error-kicker {
	font-family: var(--font-proxima-light, system-ui, sans-serif);
	font-size: 11px;
	color: var(--blue);
	letter-spacing: 0.12em;
	text-transform: uppercase;
	font-weight: 600;
	margin-bottom: 32px;
}

.error-title {
	font-family: 'Gaegu', var(--font-signature, cursive);
	font-size: clamp(72px, 18vw, 140px);
	font-weight: 700;
	line-height: 0.85;
	color: var(--text);
	margin: 0;
	letter-spacing: -0.02em;
}

.error-tagline {
	font-family: var(--font-proxima-regular, system-ui, sans-serif);
	font-size: clamp(18px, 3.5vw, 24px);
	font-weight: 400;
	color: var(--text-2);
	margin-top: 20px;
	letter-spacing: -0.01em;
}

.error-sub {
	font-family: var(--font-proxima-light, system-ui, sans-serif);
	font-size: 14px;
	color: var(--text-muted);
	margin-top: 12px;
	line-height: 1.6;
}

.error-actions {
	display: flex;
	gap: 12px;
	justify-content: center;
	flex-wrap: wrap;
	margin-top: 40px;
}

.btn-primary {
	background: rgba(255, 255, 255, 0.85);
	color: var(--blue);
	border: 1px solid rgba(255, 255, 255, 0.7);
	padding: 14px 36px;
	font-family: var(--font-proxima-light, system-ui, sans-serif);
	font-size: 12px;
	font-weight: 400;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	border-radius: 980px;
	cursor: pointer;
	transition: all 0.2s ease;
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}
.btn-primary:hover {
	background: rgba(255, 255, 255, 0.95);
	box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
	transform: translateY(-1px);
}
.btn-primary:active {
	transform: scale(0.97) translateY(0);
}

.btn-ghost {
	background: rgba(255, 255, 255, 0.45);
	color: var(--text-2);
	border: 1px solid rgba(255, 255, 255, 0.5);
	padding: 14px 36px;
	font-family: var(--font-proxima-light, system-ui, sans-serif);
	font-size: 12px;
	font-weight: 400;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	border-radius: 980px;
	cursor: pointer;
	transition: all 0.2s ease;
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
}
.btn-ghost:hover {
	background: rgba(255, 255, 255, 0.7);
	color: var(--blue);
}
.btn-ghost:active {
	transform: scale(0.97);
}

@media (prefers-color-scheme: dark) {
	.btn-primary {
		background: rgba(255, 255, 255, 0.1);
		color: var(--blue);
		border-color: rgba(255, 255, 255, 0.12);
	}
	.btn-primary:hover {
		background: rgba(255, 255, 255, 0.15);
	}
	.btn-ghost {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.08);
	}
	.btn-ghost:hover {
		background: rgba(255, 255, 255, 0.1);
	}
}

.error-footer {
	position: absolute;
	bottom: 40px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 1;
}
.error-footer-text {
	font-family: 'Gaegu', var(--font-signature, cursive);
	font-size: 24px;
	font-weight: 700;
	color: var(--text);
	opacity: 0.08;
}
.error-period {
	color: var(--blue);
	opacity: 1;
}

@media (max-width: 480px) {
	.error-glass {
		padding: 40px 28px;
		border-radius: 20px;
	}
}
</style>
