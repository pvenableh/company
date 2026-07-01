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
}>();

const config = useRuntimeConfig();

const logoSize = computed(() => (props.size === 'sm' ? 'w-10 h-10' : 'w-12 h-12'));

const logoUrl = computed(() => {
	const c = props.client;
	if (!c?.logo) return null;
	const fileId = typeof c.logo === 'string' ? c.logo : (c.logo as any)?.id;
	if (!fileId) return null;
	return `${config.public.directusUrl}/assets/${fileId}?key=medium-contain`;
});

const initial = computed(() => (props.client.name || '?').charAt(0).toUpperCase());
const cleanWebsite = computed(() => props.client.website?.replace(/^https?:\/\//, ''));
</script>

<template>
	<div class="flex items-center gap-3">
		<div class="shrink-0">
			<img
				v-if="logoUrl"
				:src="logoUrl"
				:alt="client.name || 'Client'"
				class="rounded-lg object-contain bg-white"
				:class="logoSize"
			/>
			<div
				v-else
				class="rounded-lg bg-muted/60 flex items-center justify-center text-sm font-semibold text-muted-foreground"
				:class="logoSize"
			>
				{{ initial }}
			</div>
		</div>
		<div class="min-w-0 flex-1">
			<!-- Name + status live in the page hero (AppHeader); this strip is
			     the metadata row so the name isn't repeated. -->
			<p v-if="cleanWebsite" class="text-xs text-muted-foreground truncate inline-flex items-center gap-1">
				<Icon name="lucide:globe" class="w-3 h-3 shrink-0" />
				<a :href="client.website!" target="_blank" rel="noopener" class="hover:text-foreground truncate">
					{{ cleanWebsite }}
				</a>
			</p>
			<p v-else class="text-xs text-muted-foreground italic">No website set</p>
		</div>
		<div v-if="$slots.actions" class="flex items-center gap-1.5 shrink-0">
			<slot name="actions" />
		</div>
	</div>
</template>
