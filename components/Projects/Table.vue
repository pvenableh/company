<template>
	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b text-left text-muted-foreground">
					<th class="pb-3 pr-4 font-medium cursor-pointer hover:text-foreground" @click="toggleSort('title')">
						Title
						<Icon v-if="sortBy === 'title'" :name="sortDir === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'" class="w-3 h-3 inline ml-1" />
					</th>
					<th class="pb-3 pr-4 font-medium">Status</th>
					<th class="pb-3 pr-4 font-medium">Service</th>
					<th class="pb-3 pr-4 font-medium cursor-pointer hover:text-foreground" @click="toggleSort('due_date')">
						Due Date
						<Icon v-if="sortBy === 'due_date'" :name="sortDir === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'" class="w-3 h-3 inline ml-1" />
					</th>
					<th class="pb-3 pr-4 font-medium">Client</th>
					<th class="pb-3 pr-4 font-medium">Progress</th>
				<th class="pb-3 pr-4 font-medium">Assigned To</th>
					<th class="pb-3 font-medium cursor-pointer hover:text-foreground" @click="toggleSort('date_updated')">
						Updated
						<Icon v-if="sortBy === 'date_updated'" :name="sortDir === 'asc' ? 'lucide:arrow-up' : 'lucide:arrow-down'" class="w-3 h-3 inline ml-1" />
					</th>
				</tr>
			</thead>
			<tbody v-if="!loading">
				<tr
					v-for="project in sortedProjects"
					:key="project.id"
					class="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
					@click="navigateTo(`/projects/${project.id}`)"
				>
					<td class="py-3 pr-4">
						<div class="flex items-center gap-2">
							<div
								v-if="project.service?.color"
								class="w-2 h-2 rounded-full shrink-0"
								:style="{ backgroundColor: project.service.color }"
							/>
							<span class="font-medium">{{ project.title }}</span>
						</div>
					</td>
					<td class="py-3 pr-4">
						<span
							class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
							:class="statusClass(project.status)"
						>
							{{ project.status }}
						</span>
					</td>
					<td class="py-3 pr-4 text-muted-foreground">
						{{ project.service?.name || '—' }}
					</td>
					<td class="py-3 pr-4" :class="isOverdue(project.due_date) ? 'text-destructive font-medium' : 'text-muted-foreground'">
						{{ project.due_date ? new Date(project.due_date).toLocaleDateString() : '—' }}
					</td>
					<td class="py-3 pr-4 text-muted-foreground">
						{{ project.client?.name || '—' }}
					</td>
					<td class="py-3 pr-4">
						<div v-if="project.taskCount" class="flex items-center gap-2">
							<div class="w-16 h-1.5 bg-muted/30 rounded-full overflow-hidden">
								<div
									class="h-full rounded-full transition-all"
									:class="project.taskProgress > 75 ? 'bg-emerald-500' : project.taskProgress > 25 ? 'bg-amber-500' : 'bg-primary'"
									:style="{ width: `${project.taskProgress || 0}%` }"
								/>
							</div>
							<span class="text-[10px] text-muted-foreground">{{ project.taskProgress || 0 }}%</span>
						</div>
						<span v-else class="text-muted-foreground/40 text-xs">—</span>
					</td>
					<td class="py-3 pr-4">
						<div class="flex -space-x-1">
							<div
								v-for="assignment in (project.assigned_to || []).slice(0, 3)"
								:key="assignment.id"
								class="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium border-2 border-background"
								:title="`${assignment.directus_users_id?.first_name} ${assignment.directus_users_id?.last_name}`"
							>
								{{ (assignment.directus_users_id?.first_name?.[0] || '') }}{{ (assignment.directus_users_id?.last_name?.[0] || '') }}
							</div>
							<span
								v-if="(project.assigned_to || []).length > 3"
								class="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground border-2 border-background"
							>
								+{{ project.assigned_to.length - 3 }}
							</span>
						</div>
					</td>
					<td class="py-3 text-muted-foreground text-xs">
						{{ project.date_updated ? timeAgo(project.date_updated) : '—' }}
					</td>
				</tr>
			</tbody>
			<tbody v-else>
				<tr v-for="i in 6" :key="i">
					<td colspan="7" class="py-3">
						<div class="h-4 bg-muted rounded animate-pulse" />
					</td>
				</tr>
			</tbody>
		</table>
		<div v-if="!loading && !projects.length" class="text-center py-16 text-muted-foreground">
			<Icon name="lucide:folder-open" class="w-12 h-12 mx-auto mb-4 opacity-30" />
			<h3 class="text-base font-semibold text-foreground mb-1">No projects yet</h3>
			<p class="text-sm max-w-md mx-auto mb-6">Projects help you organize work for your clients. Create your first project to start tracking tasks, timelines, and progress.</p>
			<div class="flex flex-col items-center gap-3 text-xs">
				<div class="flex items-start gap-2 text-left max-w-sm">
					<Icon name="i-heroicons-plus-circle" class="w-4 h-4 text-primary shrink-0 mt-0.5" />
					<span><strong>Create a project</strong> — assign a client, service, and team members</span>
				</div>
				<div class="flex items-start gap-2 text-left max-w-sm">
					<Icon name="i-heroicons-clipboard-document-check" class="w-4 h-4 text-primary shrink-0 mt-0.5" />
					<span><strong>Add tasks</strong> — break work into manageable steps with due dates</span>
				</div>
				<div class="flex items-start gap-2 text-left max-w-sm">
					<Icon name="i-heroicons-chart-bar" class="w-4 h-4 text-primary shrink-0 mt-0.5" />
					<span><strong>Track progress</strong> — use Board or Timeline views to stay on top of delivery</span>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
const props = defineProps({
	projects: {
		type: Array,
		default: () => [],
	},
	loading: {
		type: Boolean,
		default: false,
	},
});

const sortBy = ref('date_updated');
const sortDir = ref('desc');

const toggleSort = (field) => {
	if (sortBy.value === field) {
		sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
	} else {
		sortBy.value = field;
		sortDir.value = 'asc';
	}
};

const sortedProjects = computed(() => {
	const list = [...props.projects];
	list.sort((a, b) => {
		let aVal = a[sortBy.value];
		let bVal = b[sortBy.value];
		if (aVal == null) aVal = '';
		if (bVal == null) bVal = '';
		if (typeof aVal === 'string') aVal = aVal.toLowerCase();
		if (typeof bVal === 'string') bVal = bVal.toLowerCase();
		if (aVal < bVal) return sortDir.value === 'asc' ? -1 : 1;
		if (aVal > bVal) return sortDir.value === 'asc' ? 1 : -1;
		return 0;
	});
	return list;
});

const statusClass = (status) => {
	switch (status) {
		case 'Pending':
			return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
		case 'Scheduled':
			return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
		case 'In Progress':
			return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
		case 'Completed':
		case 'completed':
			return 'bg-green-500/10 text-green-600 dark:text-green-400';
		case 'Archived':
			return 'bg-gray-500/10 text-gray-500';
		default:
			return 'bg-muted text-muted-foreground';
	}
};

// isOverdue and getFriendlyDate are auto-imported from utils/dates.ts
const timeAgo = (dateStr) => getFriendlyDate(dateStr);
</script>
