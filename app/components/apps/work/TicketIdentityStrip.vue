<!--
  Shared identity strip for a ticket — priority, due date (inline-editable),
  and linked project / client / team. Used by both the full page
  (`Tickets/DetailsNew.vue`) and the `TicketDetailPanel` slide-over so the two
  surfaces can't visually drift. Mirrors `ProjectIdentityStrip`.

  Title + status live in the surrounding hero (AppHeader / panel title); this
  strip is the metadata row so the title isn't repeated. The `rating` slot
  holds the ticket's CSAT badge in the same universal position clients/projects
  use, and `actions` lets the surface render its own buttons inline.
-->
<script setup lang="ts">
import { Popover, PopoverTrigger, PopoverContent } from '~/components/ui/popover';
import { Button } from '~/components/ui/button';

const props = defineProps<{
	ticket: any;
	/** When set, project/client chips call push(kind, id) instead of navigating
	    — used inside the slide-over stack so links open a panel on top. */
	usePanelStack?: boolean;
	compact?: boolean;
}>();

const emit = defineEmits<{ (e: 'update', fields: Record<string, any>): void }>();

const { push } = useAppSlideOverStack();
const { getPriorityBadgeClass } = useStatusStyle();

const priority = computed(() => props.ticket?.priority || null);
const projectId = computed(() => props.ticket?.project?.id || null);
const projectTitle = computed(() => props.ticket?.project?.title || null);
const clientId = computed(() => props.ticket?.client?.id || null);
const clientName = computed(() => props.ticket?.client?.name || null);
// Suppress the team chip when the org has Teams turned off — folding the gate
// into the computed hides the chip, its separators, and keeps the trailing
// separator logic below correct without touching every v-if.
const { teamsEnabled } = useTeamsEnabled();
const teamName = computed(() => (teamsEnabled.value ? props.ticket?.team?.name || null : null));

function fmtDate(d: string | null | undefined): string | null {
	if (!d) return null;
	const iso = String(d);
	// Date-only strings parse as UTC midnight and can roll back a day in
	// timezones behind UTC — pin to local.
	const dt = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
	try { return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return null; }
}
const dueLabel = computed(() => fmtDate(props.ticket?.due_date));

const daysRemaining = computed(() => {
	const d = props.ticket?.due_date;
	if (!d) return null;
	const due = new Date(d).getTime();
	if (!Number.isFinite(due)) return null;
	return Math.ceil((due - Date.now()) / (1000 * 60 * 60 * 24));
});

// ── Inline due-date quick-edit ──────────────────────────────────────────────
const dueOpen = ref(false);
const editDue = ref('');

function toDateInput(d: string | null | undefined): string {
	if (!d) return '';
	const iso = String(d);
	return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '';
}

watch(dueOpen, (open) => {
	if (!open) return;
	editDue.value = toDateInput(props.ticket?.due_date);
});

function saveDue() {
	emit('update', { due_date: editDue.value || null });
	dueOpen.value = false;
}

function openProject() {
	if (!projectId.value) return;
	if (props.usePanelStack) push('work-project', String(projectId.value));
	else navigateTo(`/apps/work/projects/${projectId.value}`);
}
function openClient() {
	if (!clientId.value) return;
	if (props.usePanelStack) push('client', String(clientId.value));
	else navigateTo(`/apps/clients/${clientId.value}`);
}
</script>

<template>
	<div class="flex items-center gap-3">
		<!-- Rating slot — the ticket's CSAT, kept in the universal identity
		     position clients/projects use. -->
		<div v-if="$slots.rating" class="shrink-0">
			<slot name="rating" />
		</div>

		<div class="min-w-0 flex-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
			<span
				v-if="priority"
				class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
				:class="getPriorityBadgeClass(priority)"
			>
				{{ priority }}
			</span>

			<button
				v-if="projectTitle"
				type="button"
				class="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground transition-colors"
				@click="openProject"
			>
				<Icon name="lucide:folder-kanban" class="w-3 h-3" />
				{{ projectTitle }}
			</button>
			<span v-if="projectTitle && clientName" class="opacity-40">·</span>
			<button
				v-if="clientName"
				type="button"
				class="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground transition-colors"
				@click="openClient"
			>
				<Icon name="lucide:building-2" class="w-3 h-3" />
				{{ clientName }}
			</button>

			<span v-if="teamName" class="opacity-40">·</span>
			<span v-if="teamName" class="inline-flex items-center gap-1 uppercase tracking-wide">
				<Icon name="lucide:users" class="w-3 h-3" />
				{{ teamName }}
			</span>

			<span v-if="priority || projectTitle || clientName || teamName" class="opacity-40">·</span>
			<Popover v-model:open="dueOpen">
				<PopoverTrigger as-child>
					<button
						type="button"
						class="inline-flex items-center gap-1 -mx-1 px-1.5 rounded-full uppercase tracking-wide hover:bg-muted/60 hover:text-foreground transition-colors"
						:class="[
							daysRemaining !== null && daysRemaining < 0 ? 'text-destructive' : '',
							!dueLabel ? 'text-muted-foreground/70 italic' : '',
						]"
						title="Edit due date"
					>
						<Icon name="lucide:calendar" class="w-3 h-3" />
						<template v-if="dueLabel">Due {{ dueLabel }}</template>
						<template v-else>Add due date</template>
						<span v-if="daysRemaining !== null && dueLabel" class="opacity-70">({{ daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : `${daysRemaining}d left` }})</span>
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" class="w-60 p-3 space-y-3">
					<div class="space-y-1">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Due date</label>
						<input v-model="editDue" type="date" class="w-full h-8 rounded-lg glass-field px-2 text-sm focus:outline-none" />
					</div>
					<div class="flex justify-end gap-2 pt-1">
						<Button variant="ghost" size="sm" @click="dueOpen = false">Cancel</Button>
						<Button size="sm" @click="saveDue">Save</Button>
					</div>
				</PopoverContent>
			</Popover>
		</div>

		<div v-if="$slots.actions" class="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
			<slot name="actions" />
		</div>
	</div>
</template>
