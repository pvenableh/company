<!--
  Shared identity strip for a project — status pill, title, service
  badge, client link, due date, contract value. Used by both
  `/apps/work/projects/[id]` and the `ProjectDetailPanel` slide-over so
  the two surfaces can't visually drift. Mirrors `ClientIdentityStrip`.

  `actions` slot lets the surrounding surface render its own action
  buttons (Edit, Ask Earnest, etc.) inline with the title row.
-->
<script setup lang="ts">
import { Popover, PopoverTrigger, PopoverContent } from '~/components/ui/popover';
import { Button } from '~/components/ui/button';

const props = defineProps<{
	project: any;
	size?: 'sm' | 'md';
	// Slide-over surfaces pass `compact`; the strip still renders (metadata +
	// rating are shown on every surface) but stays slim. Accepted for parity
	// with ClientIdentityStrip; the row is already compact so no layout change.
	compact?: boolean;
}>();

const emit = defineEmits<{ (e: 'update', fields: Record<string, any>): void }>();

const serviceColor = computed(() => props.project?.service?.color || 'hsl(var(--primary))');
const serviceName = computed(() => props.project?.service?.name || null);
const clientName = computed(() => props.project?.client?.name || props.project?.organization?.name || null);
const clientId = computed(() => props.project?.client?.id || null);

function fmtDate(d: string | null | undefined): string | null {
	if (!d) return null;
	// Date-only strings ("2026-06-23") parse as UTC midnight and can roll back
	// a day when displayed in a timezone behind UTC — pin them to local.
	const iso = String(d);
	const dt = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
	try { return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return null; }
}
const startLabel = computed(() => fmtDate(props.project?.start_date));
const dueLabel = computed(() => fmtDate(props.project?.due_date));

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

// ── Inline date quick-edit ────────────────────────────────────────────────
const datesOpen = ref(false);
const editStart = ref('');
const editDue = ref('');

function toDateInput(d: string | null | undefined): string {
	if (!d) return '';
	const iso = String(d);
	return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '';
}

// Seed the inputs from the project each time the popover opens.
watch(datesOpen, (open) => {
	if (!open) return;
	editStart.value = toDateInput(props.project?.start_date);
	editDue.value = toDateInput(props.project?.due_date);
});

function saveDates() {
	emit('update', {
		start_date: editStart.value || null,
		due_date: editDue.value || null,
	});
	datesOpen.value = false;
}
</script>

<template>
	<div class="flex items-center gap-3">
		<!-- Rating slot — the project's satisfaction score, kept in the same
		     universal identity position as the client rating. -->
		<div v-if="$slots.rating" class="shrink-0">
			<slot name="rating" />
		</div>
		<!-- Title + status live in the page hero (AppHeader); this strip is
		     the metadata row so the title isn't repeated. -->
		<div class="min-w-0 flex-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
			<span v-if="serviceName" class="inline-flex items-center gap-1 uppercase tracking-wide">
				<span class="w-2 h-2 rounded-full inline-block" :style="{ backgroundColor: serviceColor }" />
				{{ serviceName }}
			</span>
			<span v-if="serviceName && clientName" class="opacity-40">·</span>
			<NuxtLink
				v-if="clientName"
				:to="clientId ? `/apps/clients/${clientId}` : undefined"
				class="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground transition-colors"
			>
				<Icon name="lucide:building-2" class="w-3 h-3" />
				{{ clientName }}
			</NuxtLink>
			<span v-if="serviceName || clientName" class="opacity-40">·</span>
			<Popover v-model:open="datesOpen">
				<PopoverTrigger as-child>
					<button
						type="button"
						class="inline-flex items-center gap-1 -mx-1 px-1.5 rounded-full uppercase tracking-wide hover:bg-muted/60 hover:text-foreground transition-colors"
						:class="[
							daysRemaining !== null && daysRemaining < 0 ? 'text-destructive' : '',
							!(startLabel || dueLabel) ? 'text-muted-foreground/70 italic' : '',
						]"
						title="Edit start & due dates"
					>
						<Icon name="lucide:calendar" class="w-3 h-3" />
						<template v-if="startLabel && dueLabel">{{ startLabel }} – {{ dueLabel }}</template>
						<template v-else-if="startLabel || dueLabel">{{ startLabel || dueLabel }}</template>
						<template v-else>Add dates</template>
						<span v-if="daysRemaining !== null && dueLabel" class="opacity-70">({{ daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d left` }})</span>
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" class="w-60 p-3 space-y-3">
					<div class="space-y-1">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Start date</label>
						<input v-model="editStart" type="date" class="w-full h-8 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
					</div>
					<div class="space-y-1">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Due date</label>
						<input v-model="editDue" type="date" class="w-full h-8 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
					</div>
					<div class="flex justify-end gap-2 pt-1">
						<Button variant="ghost" size="sm" @click="datesOpen = false">Cancel</Button>
						<Button size="sm" @click="saveDates">Save</Button>
					</div>
				</PopoverContent>
			</Popover>
			<span v-if="contractLabel" class="opacity-40">·</span>
			<span v-if="contractLabel" class="inline-flex items-center gap-1">
				<Icon name="lucide:wallet" class="w-3 h-3" />
				{{ contractLabel }}
			</span>
		</div>
		<div v-if="$slots.actions" class="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
			<slot name="actions" />
		</div>
	</div>
</template>
