<!--
  ActiveWorkTabs — merges the Active Clients and Active Projects carousels into
  one card with a Clients | Projects toggle, halving the vertical space the two
  stacked carousels used to take. Each tab reuses its existing self-fetching
  carousel component; the inactive tab is kept mounted (v-show) so switching is
  instant and doesn't re-fetch.
-->
<script setup lang="ts">
const tab = ref<'clients' | 'projects'>('clients');
const tabs = [
	{ key: 'clients', label: 'Clients', icon: 'i-heroicons-user-group' },
	{ key: 'projects', label: 'Projects', icon: 'i-heroicons-square-3-stack-3d' },
] as const;
</script>

<template>
	<div class="ios-card p-4 sm:p-5">
		<div class="flex items-center gap-1 mb-4">
			<button
				v-for="t in tabs"
				:key="t.key"
				type="button"
				class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
				:class="tab === t.key
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:text-foreground hover:bg-muted/60'"
				@click="tab = t.key"
			>
				<EIcon :name="t.icon" class="w-3.5 h-3.5" />
				{{ t.label }}
			</button>
			<UiViewLink :to="tab === 'clients' ? '/apps/clients' : '/apps/work'" size="sm" class="ml-auto">
				{{ tab === 'clients' ? 'All clients' : 'All projects' }}
			</UiViewLink>
		</div>

		<!-- Both stay mounted so the toggle is instant; the carousels self-fetch. -->
		<div v-show="tab === 'clients'">
			<CommandCenterActiveClientCarousel :embedded="true" />
		</div>
		<div v-show="tab === 'projects'">
			<CommandCenterActiveProjectCarousel :embedded="true" />
		</div>
	</div>
</template>
