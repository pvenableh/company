<script setup lang="ts">
/**
 * repeater renderer — accent title + muted subtitle + markdown body per item.
 * "Stacked" flows items down the page (Hue team / references); "Cards" lays
 * them out in a responsive grid with an optional image.
 */
import { marked } from 'marked';
import type { RepeaterPayload, RepeaterItem } from '~~/shared/blocks/types';

const props = defineProps<{
	payload: RepeaterPayload;
}>();

marked.setOptions({ gfm: true, breaks: true });

function block(s: string | null | undefined): string {
	return s ? (marked.parse(s) as string) : '';
}

const items = computed<RepeaterItem[]>(() => (Array.isArray(props.payload?.items) ? props.payload.items : []));
const layout = computed(() => props.payload?.layout || 'row');
</script>

<template>
	<div class="repeater">
		<h2 v-if="payload?.heading" class="repeater__heading">{{ payload.heading }}</h2>
		<div class="repeater__items" :class="`repeater__items--${layout}`">
			<article v-for="item in items" :key="item.id" class="repeater__item">
				<img v-if="item.image_url" :src="item.image_url" alt="" class="repeater__image" />
				<div class="repeater__content">
					<h3 v-if="item.title || item.subtitle" class="repeater__title">
						<span v-if="item.title" class="repeater__name">{{ item.title }}</span>
						<span v-if="item.subtitle" class="repeater__role"> — {{ item.subtitle }}</span>
					</h3>
					<div
						v-if="item.body_markdown"
						class="repeater__body prose prose-sm max-w-none"
						v-html="block(item.body_markdown)"
					/>
				</div>
			</article>
		</div>
	</div>
</template>

<style scoped>
.repeater__heading {
	font-size: 1.3rem;
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
	margin-bottom: 1.25rem;
}
.repeater__items--row {
	display: flex;
	flex-direction: column;
	gap: 1.75rem;
}
.repeater__items--card {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 1.5rem;
}
.repeater__item {
	break-inside: avoid;
}
.repeater__image {
	width: 100%;
	height: auto;
	border-radius: 0.5rem;
	margin-bottom: 0.75rem;
	object-fit: cover;
}
.repeater__title {
	font-size: 1rem;
	margin-bottom: 0.35rem;
}
.repeater__name {
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
}
.repeater__role {
	font-weight: 500;
	opacity: 0.75;
}
.repeater__body {
	font-size: 0.9rem;
	line-height: 1.65;
}

@media print {
	.repeater__item { break-inside: avoid; }
}
</style>
