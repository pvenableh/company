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
const { getStatusBadgeClasses } = useStatusStyle();

const logoSize = computed(() => (props.size === 'sm' ? 'w-10 h-10' : 'w-12 h-12'));
const titleSize = computed(() => (props.size === 'sm' ? 'text-lg' : 'text-xl'));

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
	<div class="flex items-start gap-3">
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
			<div class="flex items-center gap-2 flex-wrap">
				<h1 class="font-semibold truncate" :class="titleSize">{{ client.name }}</h1>
				<span
					v-if="client.account_state"
					class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
					:class="getStatusBadgeClasses(client.account_state)"
				>
					{{ client.account_state }}
				</span>
				<span
					v-if="client.status === 'archived'"
					class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-zinc-400/15 text-zinc-500"
				>
					archived
				</span>
			</div>
			<p v-if="cleanWebsite" class="text-xs text-muted-foreground truncate mt-0.5">
				<a :href="client.website!" target="_blank" rel="noopener" class="hover:text-foreground">
					{{ cleanWebsite }}
				</a>
			</p>
		</div>
		<div v-if="$slots.actions" class="flex items-center gap-1.5 shrink-0">
			<slot name="actions" />
		</div>
	</div>
</template>
