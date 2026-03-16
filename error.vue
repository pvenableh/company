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
		<div class="error-content">
			<p class="error-kicker">Error {{ statusCode }}</p>
			<h1 class="error-title">{{ config.title }}</h1>
			<p class="error-tagline">{{ config.tagline }}</p>
			<p class="error-sub">{{ config.sub }}</p>

			<div class="error-rule"><span class="error-rule-mark">&starf;</span></div>

			<div class="error-actions">
				<button class="btn-ink" @click="handleError">Go home</button>
				<button class="btn-ghost" @click="goBack">Go back</button>
			</div>
		</div>

		<div class="error-footer">
			<p class="error-footer-text">Earnest<span class="error-period">.</span></p>
		</div>
	</div>
</template>

<style scoped>
.error-page {
	--paper: #f6f1e7;
	--paper-2: #ede7d9;
	--ink: #1c1812;
	--ink-2: #3d3529;
	--muted: #8c7b6b;
	--accent: #b85c2c;
	--rule: rgba(28, 24, 18, 0.12);

	min-height: 100vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	background: var(--paper);
	color: var(--ink);
	font-family: var(--font-proxima-light), system-ui, sans-serif;
	-webkit-font-smoothing: antialiased;
	padding: 48px 24px;
	position: relative;
}

.error-content {
	text-align: center;
	max-width: 560px;
}

.error-kicker {
	font-family: var(--font-proxima-light), system-ui, sans-serif;
	font-style: italic;
	font-size: 13px;
	color: var(--accent);
	letter-spacing: 0.08em;
	margin-bottom: 48px;
	text-transform: uppercase;
}

.error-title {
	font-family: var(--font-bauer-bodoni), Georgia, serif;
	font-size: clamp(64px, 15vw, 160px);
	font-weight: 600;
	letter-spacing: -0.02em;
	line-height: 0.9;
	color: var(--ink);
	margin: 0;
}

.error-tagline {
	font-family: var(--font-bauer-bodoni), Georgia, serif;
	font-size: clamp(22px, 4vw, 36px);
	font-weight: 300;
	font-style: italic;
	color: var(--ink-2);
	margin-top: 24px;
	letter-spacing: 0.01em;
}

.error-sub {
	font-family: var(--font-proxima-light), system-ui, sans-serif;
	font-size: 15px;
	color: var(--muted);
	margin-top: 16px;
	letter-spacing: 0.03em;
	line-height: 1.7;
}

.error-rule {
	display: flex;
	align-items: center;
	gap: 20px;
	margin: 48px auto;
	max-width: 200px;
}
.error-rule::before,
.error-rule::after {
	content: '';
	flex: 1;
	height: 1px;
	background: var(--rule);
}
.error-rule-mark {
	font-family: var(--font-bauer-bodoni), Georgia, serif;
	font-size: 18px;
	color: var(--accent);
	opacity: 0.5;
}

.error-actions {
	display: flex;
	gap: 16px;
	justify-content: center;
	flex-wrap: wrap;
}

.btn-ink {
	background: var(--ink);
	color: var(--paper);
	border: none;
	padding: 16px 36px;
	font-family: var(--font-proxima-light), system-ui, sans-serif;
	font-size: 13px;
	font-weight: 500;
	letter-spacing: 0.08em;
	cursor: pointer;
	transition: all 0.25s;
	text-transform: uppercase;
}
.btn-ink:hover {
	background: var(--accent);
}

.btn-ghost {
	background: transparent;
	color: var(--muted);
	border: 1px solid var(--rule);
	padding: 16px 36px;
	font-family: var(--font-proxima-light), system-ui, sans-serif;
	font-size: 13px;
	letter-spacing: 0.08em;
	cursor: pointer;
	transition: all 0.25s;
	text-transform: uppercase;
}
.btn-ghost:hover {
	border-color: var(--ink);
	color: var(--ink);
}

.error-footer {
	position: absolute;
	bottom: 48px;
	left: 50%;
	transform: translateX(-50%);
}
.error-footer-text {
	font-family: var(--font-bauer-bodoni), Georgia, serif;
	font-size: 20px;
	font-weight: 600;
	color: var(--ink);
	opacity: 0.12;
	letter-spacing: -0.02em;
}
.error-period {
	color: var(--accent);
	opacity: 1;
}
</style>
