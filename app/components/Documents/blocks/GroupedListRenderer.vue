<script setup lang="ts">
/**
 * grouped_list renderer — accent group labels over dash-bulleted item lists,
 * optionally flowed into columns. Matches the Hue HUE-605 "client
 * experience." page.
 */
import { marked } from 'marked';
import type { GroupedListPayload, GroupedListGroup } from '~~/shared/blocks/types';

const props = defineProps<{
	payload: GroupedListPayload;
}>();

marked.setOptions({ gfm: true, breaks: true });

function inline(s: string | null | undefined): string {
	return s ? (marked.parseInline(s) as string) : '';
}

const groups = computed<GroupedListGroup[]>(() =>
	Array.isArray(props.payload?.groups) ? props.payload.groups : [],
);
const columns = computed(() => props.payload?.columns || 1);
</script>

<template>
	<div class="grouped-list">
		<h2 v-if="payload?.heading" class="grouped-list__heading">{{ payload.heading }}</h2>
		<div class="grouped-list__groups" :style="{ '--cols': columns }">
			<section v-for="group in groups" :key="group.id" class="grouped-list__group">
				<h3 v-if="group.label" class="grouped-list__label">{{ group.label }}</h3>
				<ul class="grouped-list__items">
					<li v-for="(item, ii) in group.items" :key="ii" v-html="inline(item)" />
				</ul>
			</section>
		</div>
	</div>
</template>

<style scoped>
.grouped-list__heading {
	font-size: 1.3rem;
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
	margin-bottom: 1rem;
}
.grouped-list__groups {
	display: grid;
	grid-template-columns: repeat(var(--cols, 1), minmax(0, 1fr));
	gap: 1.5rem 2rem;
}
.grouped-list__group {
	break-inside: avoid;
}
.grouped-list__label {
	font-size: 0.95rem;
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
	margin-bottom: 0.4rem;
}
.grouped-list__items {
	list-style: none;
	margin: 0;
	padding: 0;
	font-size: 0.9rem;
	line-height: 1.6;
}
.grouped-list__items li {
	padding-left: 1rem;
	position: relative;
}
.grouped-list__items li::before {
	content: '–';
	position: absolute;
	left: 0;
	opacity: 0.5;
}

@media print {
	.grouped-list__group { break-inside: avoid; }
}
</style>
