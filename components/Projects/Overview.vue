<template>
	<div class="w-full px-4 py-10 min-h-svh flex items-center justify-start flex-col">
		<div class="w-full max-w-2xl">
			<h1 class="uppercase tracking-wide text-xs border-b border-gray-200">Overview</h1>
			<div class="uppercase mt-6">
				<h1 class="tracking-wide font-bold">{{ project.title }}</h1>
				<!-- <p>{{ project.description }}</p> -->
				<!-- <p v-if="isAdmin">${{ project.contract_value }}</p> -->
				<h5 class="text-[9px]">
					<span class="h-2 w-2 inline-block mr-0.5" :style="'background:' + project.service.color"></span>
					{{ project.service.name }}
				</h5>
			</div>
			<h1 class="uppercase trackine mt-12 text-[10px] font-bold border-b border-gray-200">Project Events:</h1>
			<div v-for="(event, index) in designEvents" :key="index" class="my-6">
				<h5 class="uppercase tracking-wide font-bold">{{ event.title }}</h5>

				<nuxt-link :to="/projects/ + project.id + '/events/' + event.id" class="text-[10px] leading-3 font-bold">
					EVENT DETAILS
					<UIcon name="i-heroicons-arrow-right" class="h-2 w-2" />
				</nuxt-link>
			</div>
			<!-- <ProjectsTimeline :project="project" />
		<ProjectsTimelineTwo :project="project" /> -->
		</div>
	</div>
</template>
<script setup>
const props = defineProps({
	project: {
		type: Object,
		required: true,
	},
});
const { user } = useDirectusAuth();
const { isAdmin: checkIsAdmin } = useRole();

const isAdmin = computed(() => checkIsAdmin(user.value));

const designEvents = computed(() => {
	return props.project?.events
		?.filter((event) => event.type.toLowerCase() === 'design' && event.status === 'Active')
		.sort((a, b) => new Date(a.date) - new Date(b.date))
		.map((event) => {
			return {
				id: event.id,
				title: event.title,
				description: event.description,
				prototype: event.prototype_link,
				link: event.link,
				priority: event.priority,
				approval: event.approval,
				file: event.file,
			};
		});
});
</script>
