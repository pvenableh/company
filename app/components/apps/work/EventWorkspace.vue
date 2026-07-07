<!--
  EventWorkspace — shared body for the project-event detail surface.

  Mounted by BOTH `/projects/[id]/events/[event]` (full-page deep-link
  receiver) and `panels/EventPanel.vue` (slide-over) so the two
  surfaces can't drift. `:compact` hides the chrome the slide-over
  shell already provides (the inline page header, the AI sidebar
  overlay) and collapses the two-column grid to a single column.
-->
<script setup>
const props = defineProps({
	eventId: { type: String, required: true },
	compact: { type: Boolean, default: false },
});

const emit = defineEmits(['loaded', 'back']);

const router = useRouter();
const toast = useToast();
const { push: pushPanel } = useAppSlideOverStack();
const projectEventItems = useDirectusItems('project_events');
const videoMeetingItems = useDirectusItems('video_meetings');
const { getUrl } = useDirectusFiles();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

const event = ref(null);
const loading = ref(true);
const error = ref(null);
const creatingMeeting = ref(false);

async function loadEvent() {
	loading.value = true;
	error.value = null;
	try {
		event.value = await projectEventItems.get(props.eventId, {
			fields: [
				'*,files.directus_files_id.id,files.directus_files_id.title,files.directus_files_id.type,files.directus_files_id.width,files.directus_files_id.height,files.directus_files_id.filename_download,project.id,project.title,project.service.color,project.organization.id,project.organization.name,project.organization.logo,project.client',
			],
		});
		if (event.value) emit('loaded', event.value);
	} catch (err) {
		error.value = err?.message || 'Failed to load event';
	} finally {
		loading.value = false;
	}
}

watch(() => props.eventId, loadEvent, { immediate: true });

// Set AI sidebar entity context only when the workspace owns the page
// (compact panels nest inside a parent surface that already owns it).
watch(event, (e) => {
	if (props.compact) return;
	if (e?.id) setEntity('project_event', String(e.id), e.title || 'Event');
}, { immediate: true });
onBeforeUnmount(() => {
	if (!props.compact) clearEntity();
});

async function handleStatusChanged(newStatus) {
	if (!event.value) return;
	await projectEventItems.update(event.value.id, { status: newStatus });
}

const eventImages = computed(() => {
	return (event.value?.files || [])
		.filter((f) => f.directus_files_id?.type?.startsWith('image/'))
		.map((f) => f.directus_files_id);
});

const eventFiles = computed(() => {
	return (event.value?.files || [])
		.filter((f) => !f.directus_files_id?.type?.startsWith('image/'))
		.map((f) => f.directus_files_id);
});

const hasVisualContent = computed(() => {
	return event.value?.prototype_link || eventImages.value.length > 0;
});

const lightboxOpen = ref(false);
const lightboxIndex = ref(0);
function openLightbox(index) {
	lightboxIndex.value = index;
	lightboxOpen.value = true;
}

// ─── Meetings linked to this event ───
const meetings = ref([]);
const meetingsLoading = ref(true);

async function loadMeetings() {
	if (!props.eventId) return;
	meetingsLoading.value = true;
	try {
		meetings.value = await videoMeetingItems.list({
			fields: ['id', 'room_name', 'title', 'status', 'scheduled_start', 'scheduled_end', 'meeting_url', 'host_user.first_name', 'host_user.last_name'],
			filter: { project_event: { _eq: props.eventId } },
			sort: ['-scheduled_start'],
			limit: 50,
		});
	} catch {
		meetings.value = [];
	} finally {
		meetingsLoading.value = false;
	}
}
watch(() => props.eventId, loadMeetings, { immediate: true });

function formatMeetingTime(iso) {
	if (!iso) return '';
	return new Date(iso).toLocaleString('en-US', {
		month: 'short', day: 'numeric',
		hour: 'numeric', minute: '2-digit', hour12: true,
	});
}

function meetingStatusTone(status) {
	return ({
		scheduled: 'bg-info/10 text-info dark:text-info',
		in_progress: 'bg-success/10 text-success dark:text-success',
		completed: 'bg-muted text-muted-foreground',
		cancelled: 'bg-destructive/10 text-destructive dark:text-destructive',
		no_show: 'bg-warning/10 text-warning dark:text-warning',
		archived: 'bg-muted text-muted-foreground',
	}[status] || 'bg-muted text-muted-foreground');
}

async function startMeetingForEvent() {
	if (!event.value) return;
	creatingMeeting.value = true;
	try {
		const projectId = typeof event.value.project === 'object' ? event.value.project?.id : event.value.project;
		const response = await $fetch('/api/video/create-room', {
			method: 'POST',
			body: {
				title: event.value.title || 'Design Review',
				description: event.value.description || null,
				scheduled_start: new Date().toISOString(),
				duration: 60,
				meeting_type: 'project_review',
				project: projectId,
				project_event: event.value.id,
			},
		});
		toast.add({ title: 'Meeting room created', color: 'green' });
		window.open(`/meeting/${response.data.roomName}`, '_blank');
		await loadMeetings();
	} catch (err) {
		toast.add({ title: 'Failed to start meeting', description: err?.message, color: 'red' });
	} finally {
		creatingMeeting.value = false;
	}
}

const projectInfo = computed(() => {
	const p = event.value?.project;
	if (!p) return null;
	if (typeof p === 'string') return { id: p, title: 'Project' };
	return {
		id: p.id,
		title: p.title || 'Project',
		color: p.service?.color || null,
		orgName: p.organization?.name || null,
	};
});

// Inline "Details" editor — autosaving scalar fields. Enum values match the
// project_events interface verbatim (note the Capitalized status/type values).
const detailFields = [
	{ key: 'title', label: 'Title', type: 'text', placeholder: 'Event title…' },
	{
		key: 'type', label: 'Type', type: 'select', options: [
			{ value: 'General', label: 'General' },
			{ value: 'Design', label: 'Design' },
			{ value: 'Content', label: 'Content' },
			{ value: 'Timeline', label: 'Timeline' },
			{ value: 'Financial', label: 'Financial' },
			{ value: 'Hours', label: 'Hours' },
		],
	},
	{
		key: 'status', label: 'Status', type: 'select', options: [
			{ value: 'draft', label: 'Draft' },
			{ value: 'Scheduled', label: 'Scheduled' },
			{ value: 'Active', label: 'Active' },
			{ value: 'Completed', label: 'Completed' },
			{ value: 'archived', label: 'Archived' },
		],
	},
	{ key: 'event_date', label: 'Event Date', type: 'date' },
	{ key: 'end_date', label: 'End Date', type: 'date' },
	{ key: 'description', label: 'Description', type: 'textarea', rows: 4 },
];

const detailValues = computed(() => ({
	title: event.value?.title ?? '',
	type: event.value?.type ?? '',
	status: event.value?.status ?? '',
	event_date: (event.value?.event_date || '').slice(0, 10),
	end_date: (event.value?.end_date || '').slice(0, 10),
	description: event.value?.description ?? '',
}));

function openProject() {
	if (!projectInfo.value?.id) return;
	if (props.compact) {
		pushPanel('work-project', String(projectInfo.value.id));
	} else {
		// Standalone mode → land the user in the apps shell with the project
		// slide-over opened over the Work floor.
		router.push(
			`/apps/work?slide=work-project:${projectInfo.value.id}`,
		);
	}
}
</script>

<template>
	<div :class="compact ? '' : 'max-w-[2600px] mx-auto project-event'">
		<div v-if="loading" class="text-center py-12 text-sm text-muted-foreground">Loading…</div>
		<div v-else-if="error" class="ios-card p-8 text-center">
			<div class="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-3">
				<Icon name="lucide:alert-triangle" class="w-6 h-6 text-destructive" />
			</div>
			<p class="text-sm text-foreground">{{ error }}</p>
		</div>

		<template v-else-if="event">
			<!-- Bill this milestone — only on Financial payment milestones. -->
			<div
				v-if="event.payment_amount || event.type === 'Financial' || event.is_milestone"
				class="flex justify-end px-4 pt-3"
			>
				<AppsCreateWithEarnest entity-type="project_event" label="Bill this milestone" />
			</div>

			<!-- Header (page mode only) -->
			<div
				v-if="!compact"
				class="w-full flex flex-row items-start justify-between p-4 pt-6 border-b border-border"
			>
				<div class="flex items-start gap-3">
					<BackButton :to="`/apps/work?slide=work-project:${projectInfo?.id}`" />
					<div>
						<div class="flex items-center gap-2 mb-0.5">
							<NuxtLink
								:to="`/apps/work?slide=work-project:${projectInfo?.id}`"
								class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
							>
								<span
									v-if="projectInfo?.color"
									class="inline-block h-2 w-2 rounded-full mr-1"
									:style="'background:' + projectInfo.color"
								/>
								{{ projectInfo?.title }}
							</NuxtLink>
							<span v-if="projectInfo?.orgName" class="text-[10px] text-muted-foreground/40">/</span>
							<span v-if="projectInfo?.orgName" class="text-[10px] text-muted-foreground uppercase tracking-wider">{{ projectInfo.orgName }}</span>
						</div>
						<h1 class="text-lg font-semibold text-foreground">{{ event.title }}</h1>
						<p
							v-if="event.description"
							class="text-sm text-muted-foreground mt-1 max-w-xl prose prose-sm"
							v-html="event.description"
						/>
					</div>
				</div>
				<div class="flex items-center gap-3">
					<button
						class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
						@click="sidebarOpen = true"
					>
						<EarnestIcon class="w-3.5 h-3.5" />
						<span class="hidden sm:inline">Ask Earnest</span>
					</button>
					<ReactionsBar :item-id="String(event.id)" collection="project_events" />
					<ProjectsCompletedButton
						:initial-status="event.status"
						:item-id="event.id"
						@status-changed="handleStatusChanged"
					/>
				</div>
			</div>

			<!-- Compact header strip: pivot + reactions + completion -->
			<div v-else class="flex items-center justify-between gap-2 p-4 pb-2 flex-wrap">
				<button
					v-if="projectInfo"
					type="button"
					class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
					@click="openProject"
				>
					<span
						v-if="projectInfo.color"
						class="inline-block h-2 w-2 rounded-full"
						:style="'background:' + projectInfo.color"
					/>
					{{ projectInfo.title }}
				</button>
				<div class="flex items-center gap-2">
					<ReactionsBar :item-id="String(event.id)" collection="project_events" />
					<ProjectsCompletedButton
						:initial-status="event.status"
						:item-id="event.id"
						@status-changed="handleStatusChanged"
					/>
				</div>
			</div>
			<!-- Details (inline autosaving editor) -->
			<div :class="compact ? 'px-4 pb-2 pt-1' : 'p-4'">
				<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">Details</span>
				<AppsInlineDetailsEditor
					collection="project_events"
					:item-id="String(event.id)"
					:model-value="detailValues"
					:fields="detailFields"
					@updated="patch => Object.assign(event, patch)"
				/>
			</div>

			<!-- Main content: two columns in page mode, stacked in compact -->
			<div
				:class="compact
					? 'flex flex-col gap-6 p-4'
					: 'grid grid-cols-1 lg:grid-cols-[1fr_380px] min-h-[calc(100vh-140px)] relative'"
			>
				<!-- Visual content column -->
				<div :class="compact ? '' : 'relative overflow-y-auto hide-scrollbar'">
					<div
						v-if="event.prototype_link"
						class="w-full"
						:class="compact ? '' : 'p-4'"
					>
						<div class="flex items-center gap-2 mb-2">
							<UIcon name="i-heroicons-link" class="w-3.5 h-3.5 text-muted-foreground" />
							<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Figma / Prototype</span>
							<a :href="event.prototype_link" target="_blank" class="text-[10px] text-primary hover:underline ml-auto">
								Open in new tab
							</a>
						</div>
						<div
							class="w-full border border-border rounded-lg overflow-hidden"
							:class="compact ? 'h-[360px]' : (eventImages.length ? 'h-[500px]' : 'h-[calc(100vh-240px)]')"
						>
							<DesignFigmaEmbed :url="event.prototype_link" :title="`${event.title} Prototype`" />
						</div>
					</div>

					<div v-if="eventImages.length" :class="compact ? '' : 'p-4'">
						<div class="flex items-center gap-2 mb-3">
							<UIcon name="i-heroicons-photo" class="w-3.5 h-3.5 text-muted-foreground" />
							<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Images</span>
							<span class="text-[10px] text-muted-foreground/60">{{ eventImages.length }}</span>
						</div>
						<div class="grid gap-3" :class="eventImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2'">
							<button
								v-for="(img, i) in eventImages"
								:key="img.id"
								class="relative group rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-colors cursor-pointer"
								@click="openLightbox(i)"
							>
								<img
									:src="getUrl(img.id, { width: 800, quality: 80, format: 'webp' })"
									:alt="img.title || img.filename_download"
									class="w-full h-auto object-cover"
									loading="lazy"
								/>
								<div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
									<UIcon name="i-heroicons-magnifying-glass-plus" class="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
								</div>
							</button>
						</div>
					</div>

					<div v-if="eventFiles.length" :class="compact ? '' : 'p-4 pt-0'">
						<div class="flex items-center gap-2 mb-2">
							<UIcon name="i-heroicons-paper-clip" class="w-3.5 h-3.5 text-muted-foreground" />
							<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Files</span>
						</div>
						<div class="space-y-1">
							<a
								v-for="file in eventFiles"
								:key="file.id"
								:href="getUrl(file.id)"
								target="_blank"
								class="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-sm text-foreground"
							>
								<UIcon name="i-heroicons-document-arrow-down" class="w-4 h-4 text-muted-foreground flex-shrink-0" />
								<span class="truncate">{{ file.title || file.filename_download }}</span>
							</a>
						</div>
					</div>

					<div
						v-if="!hasVisualContent"
						:class="compact
							? 'flex items-center justify-center py-10'
							: 'flex items-center justify-center h-full min-h-[400px]'"
					>
						<div class="text-center">
							<Icon name="lucide:layout" class="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
							<p class="text-sm text-muted-foreground">No Figma link or images attached</p>
						</div>
					</div>
				</div>

				<!-- Sidebar: Tasks + Meetings + Discussion -->
				<div :class="compact ? '' : 'bg-card border-l border-border overflow-hidden'">
					<div :class="compact ? 'space-y-6' : 'h-full overflow-y-auto p-5 hide-scrollbar space-y-6'">
						<TasksInlineAdder
							context="event"
							:context-id="String(event.id)"
							:organization-id="projectInfo?.id ? event.project?.organization?.id : null"
						/>

						<div>
							<div class="flex items-center justify-between mb-3">
								<h3 class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
									Meetings
									<span v-if="meetings.length" class="text-muted-foreground/60">{{ meetings.length }}</span>
								</h3>
								<button
									class="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-success/10 hover:bg-success/20 text-success dark:text-success transition-colors disabled:opacity-50"
									:disabled="creatingMeeting"
									@click="startMeetingForEvent"
								>
									<UIcon
										:name="creatingMeeting ? 'i-heroicons-arrow-path' : 'i-heroicons-video-camera'"
										:class="['w-3 h-3', creatingMeeting && 'animate-spin']"
									/>
									Start
								</button>
							</div>

							<div v-if="meetingsLoading" class="text-[11px] text-muted-foreground/60 py-2">Loading…</div>
							<div v-else-if="!meetings.length" class="text-[11px] text-muted-foreground/60 py-2">
								No meetings yet. Start one to review this milestone live.
							</div>
							<ul v-else class="space-y-1.5">
								<li
									v-for="m in meetings"
									:key="m.id"
									class="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
								>
									<UIcon name="i-heroicons-video-camera" class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-1.5">
											<span class="text-[12px] font-medium text-foreground truncate">{{ m.title }}</span>
											<span
												:class="['text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0', meetingStatusTone(m.status)]"
											>
												{{ m.status?.replace('_', ' ') }}
											</span>
										</div>
										<div class="text-[10px] text-muted-foreground/70">{{ formatMeetingTime(m.scheduled_start) }}</div>
									</div>
									<!-- allow-legacy-link — Daily prebuilt UI lives at /meeting/[roomName], no apps-shell equivalent -->
									<NuxtLink
										:to="`/meeting/${m.room_name}`"
										target="_blank"
										class="text-[10px] font-semibold uppercase tracking-wider text-primary opacity-0 group-hover:opacity-100 transition-opacity"
									>
										Join
									</NuxtLink>
								</li>
							</ul>
						</div>

						<div>
							<h3 class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-4">Discussion</h3>
							<CommentsSystem
								:item-id="event.id"
								collection="project_events"
								show-comments="true"
								:organization-id="event.project?.organization?.id"
								:client-id="typeof event.project?.client === 'object' ? event.project.client?.id : event.project?.client"
							/>
						</div>
					</div>
				</div>
			</div>

			<!-- AI sidebar overlay — page mode only (panel container is transformed) -->

			<!-- Lightbox -->
			<Teleport to="body">
				<div
					v-if="lightboxOpen"
					class="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center"
					@click.self="lightboxOpen = false"
				>
					<button class="absolute top-4 right-4 text-white/70 hover:text-white" @click="lightboxOpen = false">
						<UIcon name="i-heroicons-x-mark" class="w-8 h-8" />
					</button>
					<button
						v-if="eventImages.length > 1 && lightboxIndex > 0"
						class="absolute left-4 text-white/70 hover:text-white"
						@click="lightboxIndex--"
					>
						<UIcon name="i-heroicons-chevron-left" class="w-8 h-8" />
					</button>
					<button
						v-if="eventImages.length > 1 && lightboxIndex < eventImages.length - 1"
						class="absolute right-16 text-white/70 hover:text-white"
						@click="lightboxIndex++"
					>
						<UIcon name="i-heroicons-chevron-right" class="w-8 h-8" />
					</button>
					<img
						:src="getUrl(eventImages[lightboxIndex]?.id, { width: 1600, quality: 90 })"
						:alt="eventImages[lightboxIndex]?.title"
						class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
					/>
				</div>
			</Teleport>
		</template>
	</div>
</template>

<style scoped>
.hide-scrollbar {
	scrollbar-width: none;
	-ms-overflow-style: none;
}
.hide-scrollbar::-webkit-scrollbar {
	display: none;
}
</style>
