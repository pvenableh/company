<script setup>
const { params } = useRoute();
const { readItem } = useDirectusItems();
const { readRevisions } = useDirectusRevisions();

const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});

const event = await readItem('project_events', params.event, {
	fields: [
		'*,project.id,project.title,project.service.color,project.organization.id,project.organization.name,project.organization.logo',
	],
});

//filter[collection][_eq]=project_events&filter[item][_eq]=41afa284-5daf-43ba-bb6f-8abc96daef63&fields=*,revisions.data,revisions.delta&sort=-timestamp

// const approvalStatus = await readRevisions({
// 	fields: ['*'],
// 	filter: {
// 		_and: [
// 			{
// 				collection: {
// 					_eq: 'project_events',
// 				},
// 				id: {
// 					_eq: params.event,
// 				},
// 			},
// 		],
// 	},
// });

// console.log(approvalStatus);
</script>
<template>
	<div class="max-w-[2600px] mx-auto border-b border-gray-200 dark:border-gray-700 project-event">
		<h1 class="page__title">Project Event</h1>

		<!-- Main container with full viewport height minus header -->
		<div class="grid grid-cols-[1fr_350px] min-h-[calc(100vh-100px)] relative">
			<!-- Prototype column -->
			<div class="relative overflow-y-auto hide-scrollbar">
				<!-- Header content with padding -->
				<div class="w-full flex flex-row justify-between p-4 pt-10">
					<div class="">
						<h5 class="uppercase text-[9px] font-bold">{{ event.project.organization.name }}</h5>
						<nuxt-link :to="`/projects/${event.project.id}`" class="uppercase text-[9px] font-bold">
							<span class="h-2 w-2 inline-block mr-0.5" :style="'background:' + event.project.service.color"></span>
							{{ event.project.title }}
						</nuxt-link>
						<h2 class="uppercase tracking-wide">Project Event: {{ event.title }}</h2>
						<p class="text-xs">{{ event.description }}</p>
					</div>
					<div>
						<ProjectsApprovalButton
							v-if="event.approval !== 'No Approval Necessary'"
							:initial-status="event.approval"
							:item-id="event.id"
							@status-changed="handleStatusChanged"
						/>
					</div>
				</div>

				<!-- Prototype wrapper -->
				<div v-if="event.prototype_link" class="w-full h-[calc(100vh-250px)] px-4 pb-4">
					<div class="w-full h-full border border-gray-200 dark:border-gray-700">
						<iframe
							:title="event.title + ' Prototype'"
							:src="event.prototype_link"
							class="w-full h-full"
							allowfullscreen
						/>
					</div>
				</div>
			</div>

			<!-- Comments column -->
			<div class="bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 overflow-hidden shadow-inner">
				<div class="h-full overflow-y-auto p-6 hide-scrollbar">
					<CommentsSystem
						:item-id="event.id"
						collection="project_events"
						show-comments="true"
						:organization-id="event.project.organization.id"
					/>
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

.iframe-container {
	position: relative;
	width: 100%;
	padding-bottom: 56.25%;
	height: 0;
	overflow: hidden;
	max-width: 2600px;
	margin: 0 auto;
}

.iframe-container iframe {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	border: 0;
}
</style>
