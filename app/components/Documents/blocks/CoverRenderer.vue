<script setup lang="ts">
/**
 * cover renderer — a full-bleed accent title page. Echoes the Hue HUE-605
 * cover: oversized wordmark/logo, title + subtitle, and bottom-aligned
 * meta (prepared-for + date). Colors key off `--doc-accent` so any org's
 * accent reproduces the look. Missing logo / recipient / date fall back to
 * the document's cover context (injected from BlockRenderer).
 */
import { marked } from 'marked';
import type { CoverPayload } from '~~/shared/blocks/types';

interface CoverContext {
	logoUrl?: string | null;
	recipient?: string | null;
	dateSent?: string | null;
}

const props = defineProps<{
	payload: CoverPayload;
}>();

marked.setOptions({ gfm: true, breaks: true });

const ctx = inject<ComputedRef<CoverContext | null>>(
	'docCoverContext',
	computed(() => null),
);

const showLogo = computed(() => props.payload?.show_logo !== false);
const logoUrl = computed(() => ctx.value?.logoUrl || null);
const preparedFor = computed(() => props.payload?.prepared_for || ctx.value?.recipient || '');
const date = computed(() => props.payload?.date || '');
const tagline = computed(() =>
	props.payload?.tagline_markdown ? (marked.parse(props.payload.tagline_markdown) as string) : '',
);
</script>

<template>
	<div class="doc-cover-block">
		<div class="doc-cover-block__top">
			<img v-if="showLogo && logoUrl" :src="logoUrl" alt="" class="doc-cover-block__logo" />
			<p v-if="payload?.eyebrow" class="doc-cover-block__eyebrow">{{ payload.eyebrow }}</p>
		</div>

		<div class="doc-cover-block__body">
			<h1 v-if="payload?.title" class="doc-cover-block__title">{{ payload.title }}</h1>
			<p v-if="payload?.subtitle" class="doc-cover-block__subtitle">{{ payload.subtitle }}</p>
			<div
				v-if="tagline"
				class="doc-cover-block__tagline prose prose-sm max-w-none"
				v-html="tagline"
			/>
		</div>

		<div v-if="preparedFor || date" class="doc-cover-block__meta">
			<p v-if="preparedFor">{{ preparedFor }}</p>
			<p v-if="date">{{ date }}</p>
		</div>
	</div>
</template>

<style scoped>
.doc-cover-block {
	background: var(--doc-accent, hsl(var(--primary)));
	color: #fff;
	min-height: 88vh;
	margin: -3rem -1.5rem 2rem;
	padding: 3.5rem 3rem 3rem;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.doc-cover-block__top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}
.doc-cover-block__logo {
	height: 2.75rem;
	width: auto;
	object-fit: contain;
	/* Brand marks are usually dark; knock them white on the accent panel. */
	filter: brightness(0) invert(1);
}
.doc-cover-block__eyebrow {
	margin-left: auto;
	text-transform: uppercase;
	letter-spacing: 0.18em;
	font-size: 0.72rem;
	font-weight: 600;
	opacity: 0.85;
}

.doc-cover-block__body {
	margin-top: auto;
	margin-bottom: auto;
	padding: 2rem 0;
}
.doc-cover-block__title {
	font-size: clamp(2.25rem, 6vw, 3.75rem);
	font-weight: 800;
	line-height: 1.02;
	letter-spacing: -0.02em;
	margin: 0;
}
.doc-cover-block__subtitle {
	margin-top: 1rem;
	font-size: 1.05rem;
	font-weight: 500;
	opacity: 0.92;
	max-width: 34rem;
}
.doc-cover-block__tagline {
	margin-top: 1.25rem;
	max-width: 32rem;
	opacity: 0.9;
	color: #fff;
}
.doc-cover-block__tagline :deep(a) { color: #fff; text-decoration: underline; }

.doc-cover-block__meta {
	text-align: right;
	font-size: 0.85rem;
	font-weight: 600;
	letter-spacing: 0.02em;
	line-height: 1.5;
}
.doc-cover-block__meta p { margin: 0; }
.doc-cover-block__meta p + p { opacity: 0.8; font-weight: 500; }

@media print {
	.doc-cover-block { min-height: 95vh; }
}
</style>
