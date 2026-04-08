<script setup lang="ts">
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Portal Projects | Earnest' });

const { selectedOrg } = useOrganization();
const { clientScope } = useOrgRole();

const projectItems = useDirectusItems('projects');
const eventItems = useDirectusItems('project_events');
const toast = useToast();

const loading = ref(true);
const projects = ref<any[]>([]);
const selectedProject = ref<any | null>(null);
const showDetail = ref(false);
const projectEvents = ref<any[]>([]);
const loadingEvents = ref(false);
const approvingEventId = ref<string | null>(null);

async function loadProjects() {
	if (!selectedOrg.value) return;
	loading.value = true;

	try {
		const filter: any[] = [
			{ status: { _neq: 'archived' } },
		];

		if (clientScope.value) {
			filter.push({ client: { _eq: clientScope.value } });
		}

		projects.value = await projectItems.list({
			filter: { _and: filter },
			fields: [
				'id',
				'title',
				'description',
				'status',
				'date_created',
				'date_updated',
				'service.name',
				'assigned_to.id',
				'assigned_to.first_name',
				'assigned_to.last_name',
				'assigned_to.avatar',
			],
			sort: ['-date_updated'],
			limit: 50,
		});
	} catch (err) {
		console.error('Failed to load projects:', err);
	} finally {
		loading.value = false;
	}
}

async function openProject(project: any) {
	selectedProject.value = project;
	showDetail.value = true;
	await loadProjectEvents(project.id);
}

async function loadProjectEvents(projectId: string) {
	loadingEvents.value = true;
	try {
		projectEvents.value = await eventItems.list({
			fields: ['id', 'title', 'type', 'status', 'approval', 'approved_at', 'event_date', 'end_date', 'description'],
			filter: {
				project: { _eq: projectId },
				status: { _neq: 'archived' },
			},
			sort: ['sort', 'event_date'],
			limit: 100,
		});
	} catch (err) {
		console.error('Error loading project events:', err);
		projectEvents.value = [];
	} finally {
		loadingEvents.value = false;
	}
}

async function approveEventFromPortal(eventId: string) {
	approvingEventId.value = eventId;
	try {
		await eventItems.update(eventId, {
			approval: 'Approved',
			approved_at: new Date().toISOString(),
		});
		const evt = projectEvents.value.find(e => e.id === eventId);
		if (evt) {
			evt.approval = 'Approved';
			evt.approved_at = new Date().toISOString();
		}
		toast.add({ title: 'Event approved', color: 'green' });
	} catch (err) {
		console.error('Error approving event:', err);
		toast.add({ title: 'Failed to approve', color: 'red' });
	} finally {
		approvingEventId.value = null;
	}
}

const pendingEvents = computed(() => projectEvents.value.filter(e => e.approval === 'Need Approval'));
const otherEvents = computed(() => projectEvents.value.filter(e => e.approval !== 'Need Approval'));

const statusGroups = computed(() => {
	const groups: Record<string, any[]> = {
		in_progress: [],
		scheduled: [],
		pending: [],
		completed: [],
	};

	for (const project of projects.value) {
		const key = project.status || 'pending';
		if (groups[key]) {
			groups[key].push(project);
		} else {
			groups.pending.push(project);
		}
	}
	return groups;
});

const statusLabels: Record<string, string> = {
	in_progress: 'In Progress',
	scheduled: 'Scheduled',
	pending: 'Pending',
	completed: 'Completed',
};

const statusColors: Record<string, string> = {
	in_progress: 'bg-green-500',
	scheduled: 'bg-blue-500',
	pending: 'bg-amber-500',
	completed: 'bg-gray-400',
};

const config = useRuntimeConfig();

onMounted(() => loadProjects());
watch(() => selectedOrg.value, () => loadProjects());
</script>

<template>
	<div class="p-6 max-w-5xl mx-auto">
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-xl font-semibold">Projects</h1>
				<p class="text-sm text-muted-foreground mt-0.5">View your project progress and status.</p>
			</div>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-24">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
		</div>

		<!-- Empty State -->
		<div v-else-if="!projects.length" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:folder-kanban" class="w-10 h-10 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">No projects assigned yet.</p>
		</div>

		<!-- Project Groups -->
		<template v-else>
			<div v-for="(group, status) in statusGroups" :key="status">
				<template v-if="group.length > 0">
					<div class="flex items-center gap-2 mb-3 mt-6 first:mt-0">
						<div class="w-2 h-2 rounded-full" :class="statusColors[status]" />
						<h2 class="text-sm font-medium text-muted-foreground uppercase tracking-wider">
							{{ statusLabels[status] }}
						</h2>
						<span class="text-xs text-muted-foreground/60">({{ group.length }})</span>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
						<button
							v-for="project in group"
							:key="project.id"
							class="ios-card p-4 text-left hover:shadow-md transition-shadow cursor-pointer"
							@click="openProject(project)"
						>
							<div class="flex items-start justify-between mb-2">
								<h3 class="font-medium text-sm">{{ project.title }}</h3>
								<span
									v-if="project.service?.name"
									class="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0 ml-2"
								>
									{{ project.service.name }}
								</span>
							</div>

							<p v-if="project.description" class="text-xs text-muted-foreground line-clamp-2 mb-3" v-html="project.description" />

							<div class="flex items-center justify-between">
								<!-- Assigned users -->
								<div v-if="project.assigned_to?.length" class="flex -space-x-2">
									<div
										v-for="assignee in project.assigned_to.slice(0, 3)"
										:key="assignee.id"
										class="w-6 h-6 rounded-full border-2 border-background overflow-hidden bg-muted flex items-center justify-center"
									>
										<img
											v-if="assignee.avatar"
											:src="`${config.public.assetsUrl}${assignee.avatar}?key=avatar`"
											:alt="assignee.first_name"
											class="w-full h-full object-cover"
										/>
										<span v-else class="text-[9px] font-medium text-muted-foreground">
											{{ (assignee.first_name?.[0] || '') + (assignee.last_name?.[0] || '') }}
										</span>
									</div>
								</div>
								<div v-else />

								<span class="text-xs text-muted-foreground">
									{{ project.date_updated ? new Date(project.date_updated).toLocaleDateString() : '' }}
								</span>
							</div>
						</button>
					</div>
				</template>
			</div>
		</template>

		<!-- Project Detail Slide-over -->
		<Teleport to="body">
			<Transition name="slide">
				<div
					v-if="showDetail && selectedProject"
					class="fixed inset-0 z-50 flex justify-end"
				>
					<div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="showDetail = false" />
					<div class="relative w-full max-w-lg bg-background border-l border-border shadow-xl overflow-y-auto">
						<div class="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/40 p-4 flex items-center justify-between">
							<h2 class="font-semibold">{{ selectedProject.title }}</h2>
							<button
								class="p-1.5 rounded-lg hover:bg-muted/60 transition-colors"
								@click="showDetail = false"
							>
								<Icon name="lucide:x" class="w-5 h-5" />
							</button>
						</div>

						<div class="p-5 space-y-5">
							<!-- Status -->
							<div>
								<p class="text-xs text-muted-foreground mb-1">Status</p>
								<span
									class="text-xs px-2.5 py-1 rounded-full font-medium"
									:class="{
										'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': selectedProject.status === 'in_progress',
										'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': selectedProject.status === 'scheduled',
										'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': selectedProject.status === 'pending',
										'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400': selectedProject.status === 'completed',
									}"
								>
									{{ statusLabels[selectedProject.status] || selectedProject.status }}
								</span>
							</div>

							<!-- Service -->
							<div v-if="selectedProject.service?.name">
								<p class="text-xs text-muted-foreground mb-1">Service</p>
								<p class="text-sm">{{ selectedProject.service.name }}</p>
							</div>

							<!-- Description -->
							<div v-if="selectedProject.description">
								<p class="text-xs text-muted-foreground mb-1">Description</p>
								<div class="text-sm prose prose-sm" v-html="selectedProject.description" />
							</div>

							<!-- Assigned Team -->
							<div v-if="selectedProject.assigned_to?.length">
								<p class="text-xs text-muted-foreground mb-2">Assigned Team</p>
								<div class="space-y-2">
									<div
										v-for="assignee in selectedProject.assigned_to"
										:key="assignee.id"
										class="flex items-center gap-2 p-2 rounded-xl bg-muted/40"
									>
										<div class="w-7 h-7 rounded-full bg-muted overflow-hidden flex items-center justify-center">
											<img
												v-if="assignee.avatar"
												:src="`${config.public.assetsUrl}${assignee.avatar}?key=avatar`"
												:alt="assignee.first_name"
												class="w-full h-full object-cover"
											/>
											<span v-else class="text-[10px] font-medium text-muted-foreground">
												{{ (assignee.first_name?.[0] || '') + (assignee.last_name?.[0] || '') }}
											</span>
										</div>
										<span class="text-sm">{{ assignee.first_name }} {{ assignee.last_name }}</span>
									</div>
								</div>
							</div>

							<!-- Pending Approvals -->
							<div v-if="pendingEvents.length > 0">
								<p class="text-xs text-muted-foreground mb-2 flex items-center gap-1">
									<UIcon name="i-heroicons-exclamation-circle" class="w-3.5 h-3.5 text-amber-500" />
									Pending Your Approval ({{ pendingEvents.length }})
								</p>
								<div class="space-y-2">
									<div
										v-for="evt in pendingEvents"
										:key="evt.id"
										class="ios-card p-3"
									>
										<div class="flex items-start justify-between gap-2">
											<div class="min-w-0">
												<p class="text-sm font-medium truncate">{{ evt.title }}</p>
												<p class="text-[10px] text-muted-foreground mt-0.5">
													{{ evt.type }}
													<span v-if="evt.event_date"> &middot; {{ getFriendlyDateTwo(evt.event_date) }}</span>
												</p>
												<p v-if="evt.description" class="text-xs text-muted-foreground mt-1 line-clamp-2">{{ evt.description }}</p>
											</div>
											<UButton
												size="xs"
												color="green"
												variant="soft"
												icon="i-heroicons-check"
												:loading="approvingEventId === evt.id"
												@click="approveEventFromPortal(evt.id)"
											>
												Approve
											</UButton>
										</div>
									</div>
								</div>
							</div>

							<!-- Project Events -->
							<div v-if="otherEvents.length > 0">
								<p class="text-xs text-muted-foreground mb-2">Events & Milestones</p>
								<div class="space-y-1.5">
									<div
										v-for="evt in otherEvents"
										:key="evt.id"
										class="flex items-center justify-between p-2.5 rounded-xl bg-muted/30"
									>
										<div class="flex items-center gap-2 min-w-0">
											<div class="h-2 w-2 rounded-full shrink-0"
												:class="{
													'bg-green-500': evt.approval === 'Approved',
													'bg-gray-400': evt.approval !== 'Approved',
												}"
											/>
											<span class="text-xs truncate">{{ evt.title }}</span>
										</div>
										<span
											v-if="evt.approval === 'Approved'"
											class="text-[8px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-md text-green-500 bg-green-500/10 shrink-0"
										>
											Approved
										</span>
										<span v-if="evt.event_date" class="text-[9px] text-muted-foreground shrink-0 ml-2">
											{{ getFriendlyDateTwo(evt.event_date) }}
										</span>
									</div>
								</div>
							</div>

							<div v-if="loadingEvents" class="py-4">
								<div v-for="n in 3" :key="n" class="h-12 bg-muted/30 rounded-xl animate-pulse mb-2" />
							</div>

							<!-- Dates -->
							<div class="flex gap-6">
								<div>
									<p class="text-xs text-muted-foreground mb-1">Created</p>
									<p class="text-sm">{{ selectedProject.date_created ? getFriendlyDateThree(selectedProject.date_created) : '—' }}</p>
								</div>
								<div>
									<p class="text-xs text-muted-foreground mb-1">Last Updated</p>
									<p class="text-sm">{{ selectedProject.date_updated ? getFriendlyDate(selectedProject.date_updated) : '—' }}</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</Transition>
		</Teleport>
	</div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
	transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-enter-from .relative,
.slide-leave-to .relative {
	transform: translateX(100%);
}
.slide-enter-from .absolute,
.slide-leave-to .absolute {
	opacity: 0;
}
</style>
