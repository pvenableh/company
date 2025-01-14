<template>
	<div>
		<h1>Overview</h1>
		<div class="grid grid-cols-3 gap-4">
			<h1>{{ project.title }}</h1>
			<p>{{ project.description }}</p>
			<p v-if="(user.role = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01')">${{ project.contract_value }}</p>
			<h5>{{ project.service.name }}</h5>
		</div>
		<ProjectsTimeline :project="project" />
		<ProjectsTimelineTwo :project="project" />
	</div>
</template>
<script setup>
defineProps({
	project: {
		type: Object,
		required: true,
	},
});

const { user } = useDirectusAuth();
</script>
