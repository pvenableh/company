<script setup lang="ts">
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Tasks | Client Portal' });

const { selectedOrg } = useOrganization();
const { clientScope } = useOrgRole();

const taskItems = usePortalItems('tasks');

const loading = ref(true);
const tasks = ref<any[]>([]);
const filter = ref<'active' | 'completed' | 'all'>('active');

// AppFloorStrip segments — same component the staff apps use so the
// sub-nav reads visually identical across both shells. Icons follow
// the Tasks accent (green) when active.
const taskSegments = [
	{ key: 'active' as const,    label: 'Active',    icon: 'lucide:circle-dashed' },
	{ key: 'completed' as const, label: 'Completed', icon: 'lucide:check-circle-2' },
	{ key: 'all' as const,       label: 'All',       icon: 'lucide:list' },
];

const TASK_FIELDS = [
	'id',
	'description',
	'status',
	'priority',
	'due_date',
	'date_created',
	'category',
	'project_id.id',
	'project_id.title',
	'ticket_id.id',
	'ticket_id.title',
	'assigned_to.directus_users_id.first_name',
	'assigned_to.directus_users_id.last_name',
	'assigned_to.directus_users_id.avatar',
];

async function loadTasks() {
	if (!selectedOrg.value) return;
	loading.value = true;

	try {
		const conditions: any[] = [
			{ organization_id: { _eq: selectedOrg.value } },
		];

		if (clientScope.value) {
			conditions.push({ client_id: { _eq: clientScope.value } });
		}

		if (filter.value === 'active') {
			conditions.push({ status: { _neq: 'completed' } });
		} else if (filter.value === 'completed') {
			conditions.push({ status: { _eq: 'completed' } });
		}

		tasks.value = await taskItems.list({
			filter: { _and: conditions },
			fields: TASK_FIELDS,
			sort: ['status', '-date_created'],
			limit: 200,
		});
	} catch (err) {
		console.error('Failed to load tasks:', err);
	} finally {
		loading.value = false;
	}
}

const priorityConfig: Record<string, { label: string; classes: string }> = {
	urgent: { label: 'Urgent', classes: 'bg-destructive/10 text-destructive dark:bg-destructive/30 dark:text-destructive' },
	high:   { label: 'High',   classes: 'bg-warning/10 text-warning dark:bg-warning/30 dark:text-warning' },
	medium: { label: 'Medium', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
	low:    { label: 'Low',    classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

function formatDate(d: string) {
	if (!d) return null;
	const date = new Date(d);
	const today = new Date();
	const diff = Math.ceil((date.getTime() - today.setHours(0, 0, 0, 0)) / 86400000);
	if (diff === 0) return 'Today';
	if (diff === 1) return 'Tomorrow';
	if (diff < 0) return `${Math.abs(diff)}d overdue`;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isDueSoon(d: string) {
	if (!d) return false;
	const date = new Date(d);
	const today = new Date();
	const diff = Math.ceil((date.getTime() - today.setHours(0, 0, 0, 0)) / 86400000);
	return diff <= 2;
}

function isOverdue(d: string) {
	if (!d) return false;
	return new Date(d) < new Date(new Date().setHours(0, 0, 0, 0));
}

onMounted(() => loadTasks());
watch(() => selectedOrg.value, () => loadTasks());
watch(filter, () => loadTasks());
</script>

<template>
	<div class="portal-page">
		<AppHeader title="Tasks" />

		<LayoutPageContainer>
			<p class="text-sm text-muted-foreground mb-4 -mt-1">Track work items associated with your projects.</p>

			<!-- Sub-nav — same AppFloorStrip the staff apps use. -->
			<AppFloorStrip v-model="filter" :items="taskSegments" aria-label="Task filter" />

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-24">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
		</div>

		<!-- Empty State -->
		<div v-else-if="!tasks.length" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:check-square" class="w-10 h-10 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">
				{{ filter === 'active' ? 'No active tasks.' : filter === 'completed' ? 'No completed tasks.' : 'No tasks found.' }}
			</p>
		</div>

		<!-- Task List -->
		<div v-else class="space-y-2">
			<div
				v-for="task in tasks"
				:key="task.id"
				class="ios-card p-4"
			>
				<div class="flex items-start gap-3">
					<!-- Completion indicator -->
					<div
						class="mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center"
						:class="task.status === 'completed'
							? 'border-success bg-success'
							: 'border-muted-foreground/30'"
					>
						<Icon v-if="task.status === 'completed'" name="lucide:check" class="w-3 h-3 text-white" />
					</div>

					<div class="flex-1 min-w-0">
						<p
							class="text-sm leading-snug"
							:class="task.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'"
						>
							{{ task.description }}
						</p>

						<div class="flex flex-wrap items-center gap-2 mt-2">
							<!-- Priority -->
							<span
								v-if="task.priority && task.priority !== 'medium'"
								class="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
								:class="(priorityConfig[task.priority] ?? priorityConfig.medium).classes"
							>
								{{ task.priority }}
							</span>

							<!-- Due date -->
							<span
								v-if="task.due_date"
								class="text-[10px] flex items-center gap-1 font-medium"
								:class="{
									'text-destructive': isOverdue(task.due_date),
									'text-warning': !isOverdue(task.due_date) && isDueSoon(task.due_date),
									'text-muted-foreground': !isOverdue(task.due_date) && !isDueSoon(task.due_date),
								}"
							>
								<Icon name="lucide:calendar" class="w-3 h-3" />
								{{ formatDate(task.due_date) }}
							</span>

							<!-- Project link -->
							<span v-if="task.project_id?.title" class="text-[10px] text-muted-foreground flex items-center gap-1">
								<Icon name="lucide:folder" class="w-3 h-3" />
								{{ task.project_id.title }}
							</span>

							<!-- Ticket link -->
							<span v-else-if="task.ticket_id?.title" class="text-[10px] text-muted-foreground flex items-center gap-1">
								<Icon name="lucide:ticket" class="w-3 h-3" />
								{{ task.ticket_id.title }}
							</span>
						</div>
					</div>

					<!-- Assigned user avatars -->
					<div v-if="task.assigned_to?.length" class="flex -space-x-1.5 shrink-0">
						<div
							v-for="a in task.assigned_to.slice(0, 2)"
							:key="a.directus_users_id?.id"
							class="w-6 h-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[9px] font-medium text-muted-foreground"
						>
							{{ (a.directus_users_id?.first_name?.[0] ?? '') + (a.directus_users_id?.last_name?.[0] ?? '') }}
						</div>
					</div>
				</div>
			</div>
		</div>
		</LayoutPageContainer>
	</div>
</template>
