<!--
  PriorityActionQuickStatus
  Inline status control for a Priority Action card. Lets the user advance a
  ticket / project / task (or mark it done) straight from the dashboard without
  navigating to the detail page. Patches Directus optimistically, then emits
  `updated` so the host can re-run its analysis and drop the resolved item.
-->
<template>
	<DropdownMenu>
		<DropdownMenuTrigger as-child>
			<button
				type="button"
				class="flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-2 py-1 text-[10px] font-medium text-foreground/80 hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
				:disabled="saving"
				:title="`Change ${label} status`"
				@click.stop
			>
				<UIcon v-if="saving" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
				<span
					v-else
					class="inline-block h-2 w-2 rounded-full"
					:style="{ background: statusAccent(entity.status) }"
				/>
				<span class="whitespace-nowrap">{{ currentLabel }}</span>
				<UIcon name="i-heroicons-chevron-up-down" class="w-3 h-3 text-muted-foreground/60" />
			</button>
		</DropdownMenuTrigger>
		<DropdownMenuContent align="end" class="w-40" @click.stop>
			<DropdownMenuLabel class="text-[10px] uppercase tracking-wide text-muted-foreground">
				Set {{ label }} status
			</DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuItem
				v-for="opt in options"
				:key="opt.value"
				class="text-xs"
				:class="{ 'font-semibold text-primary': isCurrent(opt.value) }"
				@select="(e: Event) => { e.preventDefault(); setStatus(opt.value); }"
			>
				<span
					class="mr-2 inline-block h-2 w-2 rounded-full"
					:style="{ background: statusAccent(opt.value) }"
				/>
				{{ opt.label }}
				<UIcon
					v-if="isCurrent(opt.value)"
					name="i-heroicons-check"
					class="ml-auto w-3.5 h-3.5"
				/>
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
</template>

<script setup lang="ts">
// These shadcn shims aren't globally auto-registered under their bare names —
// without an explicit import Vue renders them as unknown inline elements (the
// whole menu spills open in the card). Import like the other consumers do.
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface Entity {
	collection: 'tickets' | 'projects' | 'tasks';
	id: string;
	status?: string;
}

const props = defineProps<{ entity: Entity }>();
const emit = defineEmits<{ (e: 'updated', status: string): void }>();

const { getStatusAccent } = useStatusStyle();
const statusAccent = (s: string) => getStatusAccent(s);

const saving = ref(false);

// Per-collection status vocabularies (mirrors the FormModals / board columns).
// Note the casing quirks: tickets are Capitalized, projects use a lowercase
// 'completed', tasks are fully lowercase.
const STATUS_OPTIONS: Record<Entity['collection'], { label: string; value: string }[]> = {
	tickets: [
		{ label: 'Pending', value: 'Pending' },
		{ label: 'Scheduled', value: 'Scheduled' },
		{ label: 'In Progress', value: 'In Progress' },
		{ label: 'Completed', value: 'Completed' },
		{ label: 'Archived', value: 'Archived' },
	],
	projects: [
		{ label: 'Pending', value: 'Pending' },
		{ label: 'Scheduled', value: 'Scheduled' },
		{ label: 'In Progress', value: 'In Progress' },
		{ label: 'Completed', value: 'completed' },
		{ label: 'Archived', value: 'Archived' },
	],
	tasks: [
		{ label: 'To Do', value: 'new' },
		{ label: 'In Progress', value: 'in_progress' },
		{ label: 'Completed', value: 'completed' },
	],
};

const LABELS: Record<Entity['collection'], string> = {
	tickets: 'ticket',
	projects: 'project',
	tasks: 'task',
};

const COMPLETED_VALUE: Record<Entity['collection'], string> = {
	tickets: 'Completed',
	projects: 'completed',
	tasks: 'completed',
};

const options = computed(() => STATUS_OPTIONS[props.entity.collection] || []);
const label = computed(() => LABELS[props.entity.collection] || 'item');

function isCurrent(value: string) {
	const cur = (props.entity.status || '').toLowerCase().replace(/[\s_-]+/g, '');
	return cur === value.toLowerCase().replace(/[\s_-]+/g, '');
}

// Label shown on the trigger = the item's current status. Falls back to the raw
// value (or a prompt) when the status doesn't map to a known option.
const currentLabel = computed(() => {
	const match = options.value.find((o) => isCurrent(o.value));
	if (match) return match.label;
	return props.entity.status || 'Set status';
});

async function setStatus(value: string) {
	if (saving.value || isCurrent(value)) return;
	saving.value = true;
	try {
		const items = useDirectusItems(props.entity.collection);
		const payload: Record<string, any> = { status: value };
		// `tasks` carries a completion timestamp; clear it when re-opening.
		if (props.entity.collection === 'tasks') {
			payload.date_completed = value === COMPLETED_VALUE.tasks ? new Date().toISOString() : null;
		}
		await items.update(props.entity.id, payload);
		emit('updated', value);
	} catch (err) {
		console.error('[PriorityActionQuickStatus] Failed to update status:', err);
	} finally {
		saving.value = false;
	}
}
</script>
