<!--
  TaskCreate — "New Task" affordance for the Work → Tasks floor.

  The Tasks floor (`/apps/work?floor=tasks`) renders ticket sub-tasks: rows in
  the `tasks` collection surfaced through their parent ticket's `tasks[]` (see
  useTasksList.js). So a task only appears on that floor if it is linked to a
  ticket — this form therefore requires picking a ticket, then creates the task
  against it (mirrors Tickets/Tasks.vue's inline add). On success it emits
  `taskCreated`; the floor calls the list's `refresh()` so the new row shows.

  Type-case: the trigger is a T3 action (`<UiActionButton>`) → Title Case
  ("New Task"). All form field labels are meta-labels → UPPERCASE tracking-wider.
  See docs/button-type-case-system.md.
-->
<template>
	<div>
		<UiActionButton icon="lucide:plus" @click="openForm">New Task</UiActionButton>

		<Teleport to="body">
			<Transition
				enter-active-class="transition duration-300 ease-out"
				enter-from-class="opacity-0 scale-95"
				enter-to-class="opacity-100 scale-100"
				leave-active-class="transition duration-200 ease-out"
				leave-from-class="opacity-100 scale-100"
				leave-to-class="opacity-0 scale-95"
			>
				<div
					v-if="isOpen"
					class="fixed inset-0 z-[50] overflow-auto backdrop-blur-lg bg-white/75 dark:bg-gray-900/90"
					@click.self="closeForm"
				>
					<div class="w-full max-w-md mx-auto p-4 lg:p-8 py-8">
						<div class="flex items-center justify-between mb-6">
							<div>
								<h3 class="text-lg font-semibold text-foreground">New Task</h3>
								<p class="text-xs text-muted-foreground mt-0.5">Add a task to a ticket</p>
							</div>
							<button
								class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors"
								@click="closeForm"
							>
								<Icon name="lucide:x" class="w-5 h-5 text-muted-foreground" />
							</button>
						</div>

						<form class="space-y-4" @submit.prevent="createTask">
							<div class="ios-card p-4 space-y-4">
								<div class="space-y-1.5">
									<label class="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Task</label>
									<input
										ref="titleRef"
										v-model="title"
										type="text"
										placeholder="What needs to be done?"
										class="w-full rounded-full border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
										required
									/>
								</div>

								<div class="space-y-1.5">
									<label class="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Ticket</label>
									<Select v-model="ticketId">
										<SelectTrigger class="w-full rounded-full text-sm">
											<SelectValue :placeholder="loadingTickets ? 'Loading tickets…' : (ticketOptions.length ? 'Select a ticket' : 'No tickets available')" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem v-for="t in ticketOptions" :key="t.id" :value="t.id">
												{{ t.title || 'Untitled ticket' }}
											</SelectItem>
										</SelectContent>
									</Select>
									<p v-if="!loadingTickets && !ticketOptions.length" class="text-[11px] text-muted-foreground">
										Tasks live under tickets. Create a ticket first, then add tasks to it.
									</p>
								</div>

								<div class="space-y-1.5">
									<label class="block text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Priority</label>
									<Select v-model="priority">
										<SelectTrigger class="w-full rounded-full text-sm">
											<SelectValue placeholder="Priority" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem v-for="p in priorities" :key="p.value" :value="p.value">{{ p.label }}</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							<div class="flex items-center justify-end gap-2 pt-1">
								<Button type="button" variant="ghost" size="sm" @click="closeForm">Cancel</Button>
								<Button type="submit" size="sm" :disabled="!canSubmit || saving">
									<Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
									Create Task
								</Button>
							</div>
						</form>
					</div>
				</div>
			</Transition>
		</Teleport>
	</div>
</template>

<script setup>
import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';

const props = defineProps({
	organizationId: { type: String, default: null },
});

const emit = defineEmits(['taskCreated']);

const { selectedOrg, getOrganizationFilter } = useOrganization();
const taskItems = useDirectusItems('tasks');
const ticketItems = useDirectusItems('tickets');
const toast = useToast();

const isOpen = ref(false);
const saving = ref(false);
const title = ref('');
const ticketId = ref('');
const priority = ref('medium');
const titleRef = ref(null);

const ticketOptions = ref([]);
const loadingTickets = ref(false);

const priorities = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
];

const canSubmit = computed(() => !!title.value.trim() && !!ticketId.value);

async function fetchTickets() {
	loadingTickets.value = true;
	try {
		const filter = { _and: [{ status: { _neq: 'Archived' } }] };
		const orgId = props.organizationId || selectedOrg.value;
		if (orgId) {
			const orgFilter = getOrganizationFilter(orgId);
			if (orgFilter && Object.keys(orgFilter).length) filter._and.push(orgFilter);
		}
		const rows = await ticketItems.list({
			fields: ['id', 'title'],
			filter,
			sort: ['-date_updated'],
			limit: 100,
		});
		ticketOptions.value = rows || [];
	} catch (err) {
		console.error('[TaskCreate] Failed to load tickets:', err);
		ticketOptions.value = [];
	} finally {
		loadingTickets.value = false;
	}
}

async function openForm() {
	isOpen.value = true;
	title.value = '';
	ticketId.value = '';
	priority.value = 'medium';
	document.body.style.overflow = 'hidden';
	await fetchTickets();
	nextTick(() => titleRef.value?.focus());
}

function closeForm() {
	isOpen.value = false;
	document.body.style.overflow = '';
}

async function createTask() {
	if (!canSubmit.value || saving.value) return;
	saving.value = true;
	try {
		await taskItems.create({
			description: title.value.trim(),
			title: title.value.trim(),
			ticket_id: ticketId.value,
			status: 'new',
			priority: priority.value,
			sort: 0,
		});
		toast.add({ title: 'Task created', color: 'green' });
		emit('taskCreated');
		closeForm();
	} catch (err) {
		console.error('[TaskCreate] Failed to create task:', err);
		toast.add({ title: 'Failed to create task', description: 'Please try again.', color: 'red' });
	} finally {
		saving.value = false;
	}
}

onMounted(() => {
	const onKey = (e) => {
		if (e.key === 'Escape' && isOpen.value) closeForm();
	};
	document.addEventListener('keydown', onKey);
	onUnmounted(() => {
		document.removeEventListener('keydown', onKey);
		document.body.style.overflow = '';
	});
});
</script>
