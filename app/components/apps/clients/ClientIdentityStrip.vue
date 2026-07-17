<!--
  Shared identity strip for a client — logo (or initial), name, status
  badge, optional website. Used by both the full-page detail at
  `/apps/clients/[id]` and the `ClientDetailPanel` slide-over so the two
  surfaces can't visually drift.

  `actions` slot lets the surrounding surface render its own action
  buttons (Edit, Ask Earnest, etc.) inline with the title row.
-->
<script setup lang="ts">
import type { Client } from '~~/shared/directus';

const props = defineProps<{
	client: Client;
	size?: 'sm' | 'md';
	// Slide-over surfaces pass `compact` — the panel shell already shows the
	// name, so the strip tightens to a slim rating row. It still renders (the
	// rating is a universal element on every surface); it does not hide.
	compact?: boolean;
}>();

const config = useRuntimeConfig();

const logoSize = computed(() => (props.compact || props.size === 'sm' ? 'w-10 h-10' : 'w-12 h-12'));

const logoUrl = computed(() => {
	const c = props.client;
	if (!c?.logo) return null;
	const fileId = typeof c.logo === 'string' ? c.logo : (c.logo as any)?.id;
	if (!fileId) return null;
	return `${config.public.directusUrl}/assets/${fileId}?key=medium-contain`;
});

const initial = computed(() => (props.client.name || '?').charAt(0).toUpperCase());
</script>

<template>
	<div class="flex items-center gap-3">
		<div class="shrink-0">
			<img
				v-if="logoUrl"
				:src="logoUrl"
				:alt="client.name || 'Client'"
				class="rounded-lg object-contain bg-white shadow-md ring-1 ring-black/5"
				:class="logoSize"
			/>
			<div
				v-else
				class="rounded-lg bg-muted/60 flex items-center justify-center text-sm font-semibold text-muted-foreground shadow-md ring-1 ring-black/5"
				:class="logoSize"
			>
				{{ initial }}
			</div>
		</div>
		<div class="min-w-0 flex-1 flex items-center gap-1.5">
			<!-- Name + status live in the page hero (AppHeader); this strip is
			     the metadata row so the name isn't repeated. The Earnest rating
			     shows its breakdown inline (revenue, touch-points, overdue AR,
			     staleness). Website + brand/strategy details live in Overview. -->
			<ClientsClientRatingBadge v-if="client.id" :client-id="String(client.id)" size="sm" detailed />
		</div>
		<div v-if="$slots.actions" class="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
			<slot name="actions" />
		</div>
	</div>
</template>
