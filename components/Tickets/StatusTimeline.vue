<script setup>
const props = defineProps({
	statuses: {
		type: Array,
		default: ['Pending', 'Scheduled', 'In Progress', 'Completed'],
	},
	currentStatus: {
		type: String,
		default: 'Pending',
	},
});
</script>

<template>
	<div class="w-full flex items-center justify-center px-8 md:px-20">
		<div class="relative flex w-full items-center justify-between max-w-[600px]">
			<div class="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 transform -translate-y-1/2"></div>
			<div
				class="absolute top-1/2 left-0 h-1 transform -translate-y-1/2"
				:style="{ width: `${(statuses.indexOf(currentStatus) / (statuses.length - 1)) * 100}%` }"
				style="background-image: linear-gradient(to right, var(--cyan), var(--green))"
			></div>
			<div
				v-for="(status, index) in statuses"
				:key="status"
				class="relative flex-shrink-0 w-6 h-6 border-4 rounded-full flex items-center justify-center"
				:class="{
					'border-[var(--cyan)] bg-gray-100 shadow': statuses.indexOf(currentStatus) >= index,
					'border-gray-200 bg-white': statuses.indexOf(currentStatus) < index,
				}"
				:title="status"
			>
				<div
					class="absolute w-6 h-6 bg-white border-4 rounded-full flex items-center justify-center border-blue-500 animate-ping"
					v-if="currentStatus === status"
				></div>

				<span class="absolute text-[8px] top-full uppercase mt-2 w-[50px] text-center">
					{{ status }}
				</span>
			</div>
		</div>
	</div>
</template>

<style>
/* Optional: Add custom styles here */
</style>
