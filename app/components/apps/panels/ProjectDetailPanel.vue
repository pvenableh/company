<!--
  ProjectDetailPanel — slide-over body for a single project. Quick-look
  card with status / dates / progress / assignees + a CTA to the full
  /projects/[id] route.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const projectItemsApi = useDirectusItems('projects');
const taskItemsApi = useDirectusItems('project_tasks');

const project = ref<any | null>(null);
const taskCount = ref(0);
const taskProgress = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);

watch(
	() => props.id,
	async (id) => {
		if (!id) return;
		loading.value = true;
		error.value = null;
		project.value = null;
		taskCount.value = 0;
		taskProgress.value = 0;
		try {
			project.value = await projectItemsApi.get(id, {
				fields: [
					'id', 'title', 'status', 'due_date', 'date_updated',
					'service.id', 'service.name', 'service.color',
					'client.id', 'client.name',
					'assigned_to.id',
					'assigned_to.directus_users_id.id',
					'assigned_to.directus_users_id.first_name',
					'assigned_to.directus_users_id.last_name',
				],
			});
			// Compute progress separately so the main fetch stays cheap
			// even for projects with no tasks.
			const tasks = (await taskItemsApi
				.list({
					fields: ['id', 'completed', 'status'],
					filter: {
						_or: [
							{ project: { _eq: id } },
							{ event_id: { project: { _eq: id } } },
						],
					},
					limit: -1,
				})
				.catch(() => [])) as any[];
			taskCount.value = tasks.length;
			const done = tasks.filter((t) => t.completed || t.status === 'done').length;
			taskProgress.value = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
		} catch (err: any) {
			error.value = err?.message || 'Failed to load project';
		} finally {
			loading.value = false;
		}
	},
	{ immediate: true },
);
</script>

<template>
	<AppSlideOverShell :title="project?.title || 'Project'" @close="$emit('close')">
		<div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			<p class="text-xs text-muted-foreground">Loading project…</p>
		</div>

		<div v-else-if="project" class="space-y-5">
			<div class="flex flex-wrap items-center gap-2">
				<span
					class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-muted/40"
				>
					{{ project.status }}
				</span>
				<span v-if="project.service?.name" class="text-xs text-muted-foreground">
					{{ project.service.name }}
				</span>
				<span v-if="project.client?.name" class="text-xs text-muted-foreground">
					· {{ project.client.name }}
				</span>
			</div>

			<div class="grid grid-cols-2 gap-3 text-sm">
				<div>
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Due date</p>
					<p>{{ project.due_date ? new Date(project.due_date).toLocaleDateString() : '—' }}</p>
				</div>
				<div>
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Updated</p>
					<p>
						{{ project.date_updated ? new Date(project.date_updated).toLocaleDateString() : '—' }}
					</p>
				</div>
			</div>

			<div v-if="taskCount">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Progress</p>
				<div class="flex items-center gap-2">
					<div class="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
						<div
							class="h-full rounded-full transition-all"
							:class="
								taskProgress > 75
									? 'bg-success'
									: taskProgress > 25
									? 'bg-warning'
									: 'bg-primary'
							"
							:style="{ width: `${taskProgress}%` }"
						/>
					</div>
					<span class="text-xs text-muted-foreground tabular-nums">{{ taskProgress }}%</span>
				</div>
			</div>

			<div v-if="project.assigned_to?.length">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Assigned</p>
				<div class="flex flex-wrap gap-1.5">
					<span
						v-for="a in project.assigned_to"
						:key="a.id"
						class="text-xs px-2 py-0.5 rounded-full bg-muted/40"
					>
						{{ a.directus_users_id?.first_name }} {{ a.directus_users_id?.last_name }}
					</span>
				</div>
			</div>

			<div class="pt-3 border-t border-border/30">
				<NuxtLink
					:to="`/projects/${project.id}`"
					class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
				>
					Open full project page
					<Icon name="lucide:external-link" class="w-3 h-3" />
				</NuxtLink>
			</div>
		</div>

		<div v-else-if="error" class="text-sm text-destructive py-10 text-center">{{ error }}</div>

		<div v-else class="text-sm text-muted-foreground py-10 text-center">
			Could not load project.
		</div>
	</AppSlideOverShell>
</template>
