<template>
	<div class="cg-card-compact" :title="tooltip">
		<p class="cg-text-label mb-1 flex items-center gap-1">
			<span>Retainer · {{ periodLabel }}</span>
		</p>
		<p class="cg-text-stat tabular-nums" :class="isOver ? 'text-destructive' : 'text-foreground'">
			{{ formatHours(hoursUsed) }}<span class="text-muted-foreground/60 font-normal">/{{ formatHours(hoursAllocated) }}</span>
		</p>
		<div class="mt-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
			<div
				class="h-full rounded-full transition-all duration-500"
				:class="barColor"
				:style="{ width: `${Math.min(100, pct)}%` }"
			/>
		</div>
		<p class="cg-text-child text-muted-foreground mt-0.5 truncate">
			<span v-if="hoursAllocated <= 0">no allocation set</span>
			<span v-else-if="isOver" class="text-destructive font-medium">
				+{{ formatHours(hoursUsed - hoursAllocated) }} over
			</span>
			<span v-else>{{ formatHours(hoursAllocated - hoursUsed) }} left</span>
		</p>

		<button
			v-if="canBill"
			type="button"
			class="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
			title="Generate an invoice for this retainer period"
			@click.stop="billOpen = true"
		>
			<Icon name="lucide:receipt" class="w-3 h-3" /> Bill this period
		</button>

		<ProjectsRetainerInvoiceModal
			v-model:open="billOpen"
			:project="project"
			:hours-used="hoursUsed"
			:hours-allocated="hoursAllocated"
			:period-label="periodLabel"
		/>
	</div>
</template>

<script setup lang="ts">
import type { Project } from '~~/shared/directus';

const props = defineProps<{
	project: Project | null | undefined;
}>();

const projectRef = computed(() => props.project);
const {
	hoursUsed,
	hoursAllocated,
	pct,
	isOver,
	breakdownMinutes,
	periodLabel,
} = useRetainerBurn(projectRef);

const barColor = computed(() => {
	if (isOver.value) return 'bg-destructive';
	if (pct.value >= 80) return 'bg-amber-500';
	return 'bg-emerald-500';
});

// "Bill this period" — only when a rate + allocation are set to invoice against.
const billOpen = ref(false);
const canBill = computed(() => {
	const pr: any = props.project || {};
	return (Number(pr.retainer_hourly_rate) || 0) > 0 && (Number(pr.retainer_hours_per_period) || 0) > 0;
});

function formatHours(hours: number): string {
	if (!hours) return '0h';
	const rounded = Math.round(hours * 10) / 10;
	return Number.isInteger(rounded) ? `${rounded}h` : `${rounded}h`;
}

function formatMinutes(mins: number): string {
	return formatHours(mins / 60);
}

const tooltip = computed(() => {
	const b = breakdownMinutes.value;
	const parts: string[] = [];
	if (b.tickets) parts.push(`Tickets ${formatMinutes(b.tickets)}`);
	if (b.tasks) parts.push(`Tasks ${formatMinutes(b.tasks)}`);
	if (b.other) parts.push(`Other ${formatMinutes(b.other)}`);
	return parts.length ? parts.join(' · ') : 'No time logged this period';
});
</script>
