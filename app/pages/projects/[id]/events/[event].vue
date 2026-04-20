<script setup>
const { params } = useRoute();
const projectEventItems = useDirectusItems('project_events');
const { getUrl } = useDirectusFiles();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});

definePageMeta({
	middleware: ['auth'],
});
useHead({ title: 'Project Event | Earnest' });

const event = await projectEventItems.get(params.event, {
	fields: [
		'*,files.directus_files_id.id,files.directus_files_id.title,files.directus_files_id.type,files.directus_files_id.width,files.directus_files_id.height,files.directus_files_id.filename_download,project.id,project.title,project.service.color,project.organization.id,project.organization.name,project.organization.logo,project.client',
	],
});

if (event?.id) setEntity('project_event', String(event.id), event.title || 'Event');
onUnmounted(() => clearEntity());

const handleStatusChanged = async (newStatus) => {
	await projectEventItems.update(event.id, {
		status: newStatus,
	});
};

// Separate images from other files
const eventImages = computed(() => {
	return (event.files || [])
		.filter(f => f.directus_files_id?.type?.startsWith('image/'))
		.map(f => f.directus_files_id);
});

const eventFiles = computed(() => {
	return (event.files || [])
		.filter(f => !f.directus_files_id?.type?.startsWith('image/'))
		.map(f => f.directus_files_id);
});

const hasVisualContent = computed(() => {
	return event.prototype_link || eventImages.value.length > 0;
});

// Lightbox
const lightboxOpen = ref(false);
const lightboxIndex = ref(0);
const openLightbox = (index) => {
	lightboxIndex.value = index;
	lightboxOpen.value = true;
};
</script>
<template>
	<div class="max-w-[2600px] mx-auto project-event">
		<!-- Header -->
		<div class="w-full flex flex-row items-start justify-between p-4 pt-6 border-b border-border">
			<div class="flex items-start gap-3">
				<BackButton :to="`/projects/${event.project.id}`" />
				<div>
					<div class="flex items-center gap-2 mb-0.5">
						<nuxt-link :to="`/projects/${event.project.id}`" class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
							<span class="inline-block h-2 w-2 rounded-full mr-1" :style="'background:' + event.project.service.color"></span>
							{{ event.project.title }}
						</nuxt-link>
						<span class="text-[10px] text-muted-foreground/40">/</span>
						<span class="text-[10px] text-muted-foreground uppercase tracking-wider">{{ event.project.organization.name }}</span>
					</div>
					<h1 class="text-lg font-semibold text-foreground">{{ event.title }}</h1>
					<p v-if="event.description" class="text-sm text-muted-foreground mt-1 max-w-xl prose prose-sm" v-html="event.description" />
				</div>
			</div>
			<div class="flex items-center gap-3">
				<button
					class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
					@click="sidebarOpen = true"
				>
					<UIcon name="lucide:sparkles" class="w-3.5 h-3.5" />
					<span class="hidden sm:inline">Ask Earnest</span>
				</button>
				<ReactionsBar
					:item-id="String(event.id)"
					collection="project_events"
				/>
				<ProjectsCompletedButton
					:initial-status="event.status"
					:item-id="event.id"
					@status-changed="handleStatusChanged"
				/>
			</div>
		</div>

		<!-- Main content -->
		<div class="grid grid-cols-1 lg:grid-cols-[1fr_380px] min-h-[calc(100vh-140px)] relative">
			<!-- Visual content column -->
			<div class="relative overflow-y-auto hide-scrollbar">
				<!-- Figma / Prototype embed -->
				<div v-if="event.prototype_link" class="w-full p-4" :class="{ 'h-full': !eventImages.length }">
					<div class="flex items-center gap-2 mb-2">
						<UIcon name="i-heroicons-link" class="w-3.5 h-3.5 text-muted-foreground" />
						<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Figma / Prototype</span>
						<a :href="event.prototype_link" target="_blank" class="text-[10px] text-primary hover:underline ml-auto">Open in new tab</a>
					</div>
					<div class="w-full border border-border rounded-lg overflow-hidden" :class="eventImages.length ? 'h-[500px]' : 'h-[calc(100vh-240px)]'">
						<iframe
							:title="event.title + ' Prototype'"
							:src="event.prototype_link"
							class="w-full h-full"
							allowfullscreen
						/>
					</div>
				</div>

				<!-- Image gallery -->
				<div v-if="eventImages.length" class="p-4">
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

				<!-- Attached files (non-image) -->
				<div v-if="eventFiles.length" class="p-4 pt-0">
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

				<!-- Empty state -->
				<div v-if="!hasVisualContent" class="flex items-center justify-center h-full min-h-[400px]">
					<div class="text-center">
						<Icon name="lucide:layout" class="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
						<p class="text-sm text-muted-foreground">No Figma link or images attached</p>
					</div>
				</div>
			</div>

			<!-- Sidebar: Tasks + Comments -->
			<div class="bg-card border-l border-border overflow-hidden">
				<div class="h-full overflow-y-auto p-5 hide-scrollbar space-y-6">
					<!-- Tasks for this event -->
					<TasksInlineAdder context="event" :context-id="String(event.id)" :organization-id="event.project.organization.id" />

					<!-- Discussion -->
					<div>
						<h3 class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-4">Discussion</h3>
						<CommentsSystem
							:item-id="event.id"
							collection="project_events"
							show-comments="true"
							:organization-id="event.project.organization.id"
							:client-id="typeof event.project?.client === 'object' ? event.project.client?.id : event.project?.client"
						/>
					</div>
				</div>
			</div>
		</div>

		<!-- Contextual AI Sidebar -->
		<ClientOnly>
			<AIContextualSidebar
				v-if="sidebarOpen && event?.id"
				entity-type="project_event"
				:entity-id="String(event.id)"
				:entity-label="event.title || 'Event'"
				@close="closeSidebar"
			/>
			<Transition name="overlay">
				<div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
			</Transition>
		</ClientOnly>

		<!-- Lightbox -->
		<Teleport to="body">
			<div v-if="lightboxOpen" class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" @click.self="lightboxOpen = false">
				<button class="absolute top-4 right-4 text-white/70 hover:text-white" @click="lightboxOpen = false">
					<UIcon name="i-heroicons-x-mark" class="w-8 h-8" />
				</button>
				<button v-if="eventImages.length > 1 && lightboxIndex > 0" class="absolute left-4 text-white/70 hover:text-white" @click="lightboxIndex--">
					<UIcon name="i-heroicons-chevron-left" class="w-8 h-8" />
				</button>
				<button v-if="eventImages.length > 1 && lightboxIndex < eventImages.length - 1" class="absolute right-16 text-white/70 hover:text-white" @click="lightboxIndex++">
					<UIcon name="i-heroicons-chevron-right" class="w-8 h-8" />
				</button>
				<img
					:src="getUrl(eventImages[lightboxIndex]?.id, { width: 1600, quality: 90 })"
					:alt="eventImages[lightboxIndex]?.title"
					class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
				/>
			</div>
		</Teleport>
	</div>
</template>

<style>
.hide-scrollbar {
	scrollbar-width: none;
	-ms-overflow-style: none;
}

.hide-scrollbar::-webkit-scrollbar {
	display: none;
}
</style>
