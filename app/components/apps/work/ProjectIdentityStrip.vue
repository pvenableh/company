<!--
  Shared identity strip for a project — status pill, title, service
  badge, client link, due date, contract value. Used by both
  `/apps/work/projects/[id]` and the `ProjectDetailPanel` slide-over so
  the two surfaces can't visually drift. Mirrors `ClientIdentityStrip`.

  `actions` slot lets the surrounding surface render its own action
  buttons (Edit, Ask Earnest, etc.) inline with the title row.
-->
<script setup lang="ts">
const props = defineProps<{
	project: any;
	size?: 'sm' | 'md';
}>();

const { getStatusBadgeClasses } = useStatusStyle();

const titleSize = computed(() => (props.size === 'sm' ? 'text-lg' : 'text-xl'));
const swatchSize = computed(() => (props.size === 'sm' ? 'w-10 h-10' : 'w-12 h-12'));

const serviceColor = computed(() => props.project?.service?.color || 'hsl(var(--primary))');
const serviceName = computed(() => props.project?.service?.name || null);
const clientName = computed(() => props.project?.client?.name || props.project?.organization?.name || null);
const clientId = computed(() => props.project?.client?.id || null);

const dueLabel = computed(() => {
	const d = props.project?.due_date;
	if (!d) return null;
	try { return new Date(d).toLocaleDateString(); } catch { return null; }
});

const daysRemaining = computed(() => {
	const d = props.project?.due_date;
	if (!d) return null;
	const due = new Date(d).getTime();
	if (!Number.isFinite(due)) return null;
	return Math.ceil((due - Date.now()) / (1000 * 60 * 60 * 24));
});

const contractLabel = computed(() => {
	const n = Number(props.project?.contract_value);
	if (!Number.isFinite(n) || n <= 0) return null;
	return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
});

const titleInitial = computed(() => (props.project?.title || '?').charAt(0).toUpperCase());
</script>

<template>
	<div class="flex items-start gap-3">
		<div class="shrink-0">
			<div
				class="rounded-lg flex items-center justify-center text-sm font-semibold text-white"
				:class="swatchSize"
				:style="{ backgroundColor: serviceColor }"
			>
				{{ titleInitial }}
			</div>
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2 flex-wrap">
				<h1 class="font-semibold truncate" :class="titleSize">{{ project?.title || 'Project' }}</h1>
				<span
					v-if="project?.status"
					class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
					:class="getStatusBadgeClasses(project.status)"
				>
					{{ project.status }}
				</span>
			</div>
			<div class="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
				<span v-if="serviceName" class="inline-flex items-center gap-1 uppercase tracking-wide">
					<span class="w-2 h-2 rounded-full inline-block" :style="{ backgroundColor: serviceColor }" />
					{{ serviceName }}
				</span>
				<span v-if="serviceName && clientName" class="opacity-40">·</span>
				<NuxtLink
					v-if="clientName"
					:to="clientId ? `/apps/clients/${clientId}` : undefined"
					class="inline-flex items-center gap-1 hover:text-foreground transition-colors"
				>
					<Icon name="lucide:building-2" class="w-3 h-3" />
					{{ clientName }}
				</NuxtLink>
				<span v-if="(serviceName || clientName) && dueLabel" class="opacity-40">·</span>
				<span v-if="dueLabel" class="inline-flex items-center gap-1" :class="daysRemaining !== null && daysRemaining < 0 ? 'text-destructive' : ''">
					<Icon name="lucide:calendar" class="w-3 h-3" />
					{{ dueLabel }}
					<span v-if="daysRemaining !== null" class="opacity-70">({{ daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d left` }})</span>
				</span>
				<span v-if="contractLabel && (serviceName || clientName || dueLabel)" class="opacity-40">·</span>
				<span v-if="contractLabel" class="inline-flex items-center gap-1">
					<Icon name="lucide:dollar-sign" class="w-3 h-3" />
					{{ contractLabel }}
				</span>
			</div>
		</div>
		<div v-if="$slots.actions" class="flex items-center gap-1.5 shrink-0">
			<slot name="actions" />
		</div>
	</div>
</template>
