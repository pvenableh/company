<template>
	<div>
		<h1>Overview</h1>
		<div class="grid grid-cols-3 gap-4">
			<h1>{{ project.title }}</h1>
			<p>{{ project.description }}</p>
			<p v-if="isAdmin">${{ project.contract_value }}</p>
			<h5>{{ project.service.name }}</h5>
		</div>
		<div v-for="(event, index) in designEvents" :key="index" class="">
			<h5>{{ event.title }}</h5>
			<div v-if="event.prototype" class="w-full">
				<iframe
					style="border: 1px solid rgba(0, 0, 0, 0.1)"
					width="800"
					height="450"
					:src="event.prototype"
					allowfullscreen
				></iframe>
			</div>
		</div>
		<!-- <ProjectsTimeline :project="project" />
		<ProjectsTimelineTwo :project="project" /> -->
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
		?.filter((event) => event.type.toLowerCase() === 'design')
		.map((event) => {
			return {
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
