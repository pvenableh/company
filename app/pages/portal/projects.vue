<script setup lang="ts">
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Projects | Client Portal' });

const { selectedOrg } = useOrganization();
const { clientScope } = useOrgRole();

const projectItems = usePortalItems('projects');
const eventItems = usePortalItems('project_events');
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
		// Client scoping is enforced server-side by /api/portal/items.
		// `projects.status` is capitalized except for `completed` — exclude
		// the "Archived" enum specifically.
		const filter: any[] = [
			{ status: { _neq: 'Archived' } },
		];

		projects.value = await projectItems.list({
			filter: { _and: filter },
			fields: [
				'id',
				'title',
				'description',
				'status',
				'start_date',
				'due_date',
				'completion_date',
				'color',
				'date_created',
				'date_updated',
				'csat_rating',
				'csat_comment',
				'csat_submitted_at',
				'service.name',
				'assigned_to.id',
				'assigned_to.directus_users_id.id',
				'assigned_to.directus_users_id.first_name',
				'assigned_to.directus_users_id.last_name',
				'assigned_to.directus_users_id.avatar',
				// Events are needed for Gantt + completion %; cap them and
				// drop archived in the same shape the Gantt expects.
				'events.id',
				'events.title',
				'events.type',
				'events.status',
				'events.approval',
				'events.event_date',
				'events.end_date',
				'events.duration_days',
				'events.is_milestone',
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

function onProjectRated(p: { rating: number; comment: string | null; submitted_at: string }) {
	if (!selectedProject.value) return;
	selectedProject.value.csat_rating = p.rating;
	selectedProject.value.csat_comment = p.comment;
	selectedProject.value.csat_submitted_at = p.submitted_at;
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
			fields: [
				'id', 'title', 'type', 'status', 'approval', 'approved_at',
				'event_date', 'end_date', 'description',
				'prototype_link',
				'files.directus_files_id.id',
				'files.directus_files_id.type',
				'files.directus_files_id.title',
				'files.directus_files_id.filename_download',
			],
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

function eventDesignImages(evt: any) {
	return (evt?.files || [])
		.map((f: any) => f.directus_files_id)
		.filter((f: any) => f && typeof f.type === 'string' && f.type.startsWith('image/'));
}

function eventHasDesign(evt: any) {
	return !!(evt?.prototype_link || eventDesignImages(evt).length > 0);
}

async function approveEventFromPortal(eventId: string) {
	approvingEventId.value = eventId;
	try {
		await $fetch('/api/portal/event-approve', {
			method: 'POST',
			body: { eventId },
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

const config = useRuntimeConfig();

// View mode — persisted per-tab so the client lands on the same view they
// were last using. Default to Gantt for the timeline-progress story.
type ViewMode = 'gantt' | 'kanban' | 'list';
const VIEW_KEY = 'portal-projects-view';
const view = ref<ViewMode>('gantt');

if (import.meta.client) {
	const saved = localStorage.getItem(VIEW_KEY) as ViewMode | null;
	if (saved === 'gantt' || saved === 'kanban' || saved === 'list') {
		view.value = saved;
	}
}

watch(view, (v) => {
	if (import.meta.client) localStorage.setItem(VIEW_KEY, v);
});

// AppFloorStrip segments — shape matches the staff apps so the sub-nav
// reads identical across both shells.
const projectSegments: Array<{ key: ViewMode; label: string; icon: string }> = [
	{ key: 'gantt',  label: 'Timeline', icon: 'lucide:bar-chart-3' },
	{ key: 'kanban', label: 'Board',    icon: 'lucide:kanban-square' },
	{ key: 'list',   label: 'List',     icon: 'lucide:list' },
];

// Deep-link support: /portal/projects?highlight=<id> opens that project's
// slide-over once projects have loaded (same effect as a list-row click).
// Fires once per id so a later reload/org-switch doesn't re-pop it.
const route = useRoute();
const highlightHandledFor = ref<string | null>(null);
function maybeOpenHighlighted() {
	const id = route.query.highlight ? String(route.query.highlight) : null;
	if (!id || highlightHandledFor.value === id) return;
	const match = projects.value.find((p) => String(p.id) === id);
	if (match) {
		highlightHandledFor.value = id;
		openProject(match);
	}
}

onMounted(async () => {
	await loadProjects();
	maybeOpenHighlighted();
});
watch(() => selectedOrg.value, async () => {
	await loadProjects();
	maybeOpenHighlighted();
});
</script>

<template>
	<div class="portal-page">
		<AppHeader title="Projects" />

		<LayoutPageContainer>
			<p class="text-sm text-muted-foreground mb-4 -mt-1">Track timeline, status, and progress.</p>

			<AppFloorStrip v-model="view" :items="projectSegments" aria-label="Project view" />

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-24">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
		</div>

		<!-- Empty State -->
		<div v-else-if="!projects.length" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:folder-kanban" class="w-10 h-10 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">No projects assigned yet.</p>
		</div>

		<!-- Gantt timeline — reuses the agency component in portal mode so
			 the visual matches Command Center; reads route through
			 /api/portal/items, all write affordances are gated off.
			 Auto-expands when the client has ≤3 projects so events + tickets
			 + tasks are visible without an extra click. -->
		<ProjectTimelineUnifiedGantt v-else-if="view === 'gantt'" portal :auto-expand-threshold="3" />

		<!-- Board view — reuses agency ProjectsBoard in portal mode -->
		<ProjectsBoard v-else-if="view === 'kanban'" portal />

		<!-- List view — reuses agency ProjectsTable; row click opens the
			 portal slide-over instead of navigating to the agency detail route -->
		<div v-else class="ios-card p-5">
			<ProjectsTable :projects="projects" :loading="false" portal @select-project="openProject" />
		</div>

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
										'bg-success/10 text-success dark:bg-success/30 dark:text-success': selectedProject.status === 'In Progress',
										'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': selectedProject.status === 'Scheduled',
										'bg-warning/10 text-warning dark:bg-warning/30 dark:text-warning': selectedProject.status === 'Pending',
										'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400': selectedProject.status === 'Completed',
									}"
								>
									{{ selectedProject.status }}
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
												v-if="assignee.directus_users_id?.avatar"
												:src="`${config.public.assetsUrl}${assignee.directus_users_id.avatar}?key=avatar`"
												:alt="assignee.directus_users_id?.first_name"
												class="w-full h-full object-cover"
											/>
											<span v-else class="text-[10px] font-medium text-muted-foreground">
												{{ (assignee.directus_users_id?.first_name?.[0] || '') + (assignee.directus_users_id?.last_name?.[0] || '') }}
											</span>
										</div>
										<span class="text-sm">{{ assignee.directus_users_id?.first_name }} {{ assignee.directus_users_id?.last_name }}</span>
									</div>
								</div>
							</div>

							<!-- Pending Approvals — when an event carries a Figma link or
							     design files, surface them inline so the client can
							     review the design before approving. -->
							<div v-if="pendingEvents.length > 0">
								<p class="text-xs text-muted-foreground mb-2 flex items-center gap-1">
									<UIcon name="i-heroicons-exclamation-circle" class="w-3.5 h-3.5 text-warning" />
									Pending Your Approval ({{ pendingEvents.length }})
								</p>
								<div class="space-y-3">
									<div
										v-for="evt in pendingEvents"
										:key="evt.id"
										class="ios-card p-3 space-y-3"
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

										<!-- Figma / prototype embed for design review -->
										<div v-if="evt.prototype_link" class="rounded-lg border border-border/40 overflow-hidden">
											<div class="flex items-center gap-2 px-3 py-1.5 bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
												<UIcon name="i-heroicons-link" class="w-3 h-3" />
												Design preview
												<a :href="evt.prototype_link" target="_blank" class="ml-auto text-primary hover:underline normal-case tracking-normal font-normal">
													Open in new tab
												</a>
											</div>
											<div class="h-[320px] bg-muted/20">
												<DesignFigmaEmbed :url="evt.prototype_link" :title="`${evt.title} preview`" />
											</div>
										</div>

										<!-- Image gallery for attached mockups -->
										<div v-if="eventDesignImages(evt).length" class="grid gap-2" :class="eventDesignImages(evt).length === 1 ? 'grid-cols-1' : 'grid-cols-2'">
											<a
												v-for="img in eventDesignImages(evt)"
												:key="img.id"
												:href="`${config.public.directusUrl}/assets/${img.id}`"
												target="_blank"
												class="block rounded-lg overflow-hidden border border-border/40"
											>
												<img
													:src="`${config.public.directusUrl}/assets/${img.id}?width=600&fit=cover`"
													:alt="img.title || 'Design preview'"
													class="w-full h-32 object-cover"
												/>
											</a>
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
													'bg-success': evt.approval === 'Approved',
													'bg-gray-400': evt.approval !== 'Approved',
												}"
											/>
											<span class="text-xs truncate">{{ evt.title }}</span>
										</div>
										<span
											v-if="evt.approval === 'Approved'"
											class="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full text-success bg-success/10 shrink-0"
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

							<!-- Satisfaction rating — only renders once the project is completed -->
							<PortalCsatRating
								collection="projects"
								:item-id="selectedProject.id"
								:status="selectedProject.status"
								:rating="selectedProject.csat_rating"
								:comment="selectedProject.csat_comment"
								:submitted-at="selectedProject.csat_submitted_at"
								@submitted="onProjectRated"
							/>

							<!-- Reactions -->
							<div>
								<p class="text-xs text-muted-foreground mb-2">React</p>
								<ReactionsBar collection="projects" :item-id="selectedProject.id" />
							</div>

							<!-- Comments -->
							<div class="border-t border-border/30 pt-5">
								<PortalCommentThread
									collection="projects"
									:item-id="selectedProject.id"
									label="Comments"
								/>
							</div>
						</div>
					</div>
				</div>
			</Transition>
		</Teleport>
		</LayoutPageContainer>
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
