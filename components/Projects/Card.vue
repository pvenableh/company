<script setup>
defineProps({
	project: Object,
	default: null,
});
</script>
<template>
	<div>
		<div v-if="project" class="p-4 border rounded-lg project-card">
			<h3 class="font-medium">{{ project.title }}</h3>
			<p class="text-sm text-gray-600">{{ project.description }}</p>
			<UBadge :color="project.status === 'published' ? 'green' : 'yellow'">
				{{ project.status }}
			</UBadge>
		</div>

		<div v-else class="space-y-4">
			<USkeleton v-for="n in 6" :key="n" class="h-32 w-full" />
		</div>
	</div>
</template>
