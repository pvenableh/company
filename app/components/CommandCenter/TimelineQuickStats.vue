<template>
	<div class="ios-card p-5">
		<div class="flex items-center gap-2 mb-4">
			<UIcon name="i-heroicons-squares-2x2" class="w-5 h-5 text-primary" />
			<h3 class="text-sm font-semibold text-foreground">Quick Stats</h3>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<div v-for="stat in stats" :key="stat.label" class="p-3 rounded-xl bg-muted/20">
				<div class="flex items-center gap-2 mb-1">
					<UIcon :name="stat.icon" class="w-4 h-4" :class="stat.color" />
				</div>
				<p class="text-xl font-bold text-foreground">{{ stat.value }}</p>
				<p class="text-[10px] text-muted-foreground mt-0.5">{{ stat.label }}</p>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	metrics: Record<string, any>;
}>();

const stats = computed(() => [
	{
		label: 'Active Projects',
		value: props.metrics?.activeProjects ?? 0,
		icon: 'i-heroicons-folder-open',
		color: 'text-blue-500',
	},
	{
		label: 'Overdue Items',
		value: props.metrics?.overdueItems ?? 0,
		icon: 'i-heroicons-exclamation-triangle',
		color: 'text-red-500',
	},
	{
		label: 'Pending Invoices',
		value: props.metrics?.pendingInvoiceTotal ? `$${Math.round(props.metrics.pendingInvoiceTotal / 100).toLocaleString()}` : '$0',
		icon: 'i-heroicons-currency-dollar',
		color: 'text-green-500',
	},
	{
		label: 'Open Deals',
		value: props.metrics?.openDeals ?? 0,
		icon: 'i-heroicons-briefcase',
		color: 'text-purple-500',
	},
]);
</script>
