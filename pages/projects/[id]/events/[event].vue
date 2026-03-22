<script setup>
const { params } = useRoute();
const projectEventItems = useDirectusItems('project_events');

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
		'*,project.id,project.title,project.service.color,project.organization.id,project.organization.name,project.organization.logo,project.client',
	],
});

const handleStatusChanged = async (newStatus) => {
	await projectEventItems.update(event.id, {
		status: newStatus,
	});
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
			<!-- Prototype column -->
			<div class="relative overflow-y-auto hide-scrollbar">
				<div v-if="event.prototype_link" class="w-full h-full p-4">
					<div class="w-full h-full border border-border rounded-lg overflow-hidden">
						<iframe
							:title="event.title + ' Prototype'"
							:src="event.prototype_link"
							class="w-full h-full min-h-[calc(100vh-200px)]"
							allowfullscreen
						/>
					</div>
				</div>
				<div v-else class="flex items-center justify-center h-full min-h-[400px]">
					<div class="text-center">
						<Icon name="lucide:layout" class="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
						<p class="text-sm text-muted-foreground">No prototype link attached</p>
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
