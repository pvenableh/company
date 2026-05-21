<!--
	LeadAutomationsPanel — slide-over wrapper around the lead-stage automation
	rules editor. Singleton (no per-id route), so `id` is a sentinel `'_'`.
	Replaces the `/leads/automations` punch-out from `/apps/clients`.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const ruleCount = ref<number | null>(null);
function onLoaded(payload: { count: number }) {
	ruleCount.value = payload.count;
}

const subtitle = computed(() => {
	if (ruleCount.value === null) return 'Auto add or remove a lead’s contact from lists by stage';
	if (ruleCount.value === 0) return 'No rules yet';
	return `${ruleCount.value} rule${ruleCount.value === 1 ? '' : 's'}`;
});
</script>

<template>
	<AppSlideOverShell
		title="Lead Automations"
		:subtitle="subtitle"
		@close="$emit('close')"
	>
		<template #actions>
			<NuxtLink
				to="/leads/automations"
				class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				title="Open the automations editor as a full page"
			>
				<Icon name="lucide:external-link" class="w-3 h-3" />
				Full Page
			</NuxtLink>
		</template>

		<AppsClientsLeadAutomationsSurface compact @loaded="onLoaded" />
	</AppSlideOverShell>
</template>
