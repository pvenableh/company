<template>
	<div class="w-full flex flex-col items-start mt-4">
		<p class="text-[9px] text-gray-500 uppercase">
			<span class="opacity-50 mr-1">Ticket #:</span>
			{{ ticket?.id }}
		</p>

		<p v-if="ticket?.organization" class="text-[9px] text-gray-500 uppercase">
			<span class="opacity-50 mr-1">Client:</span>
			{{ ticket?.organization.name }}
			<span v-if="ticket?.project" class="pl-4">
				<span class="opacity-50 mr-1">Project:</span>
				{{ ticket?.project.title }}
			</span>
		</p>
		<p v-if="ticket?.user_created" class="text-[9px] text-gray-500 uppercase">
			<span class="opacity-50 mr-1">Created by:</span>
			{{ ticket?.user_created.first_name }} {{ ticket?.user_created.last_name }}
		</p>
		<p v-if="ticket?.team" class="text-[9px] text-gray-500 uppercase">
			<span class="opacity-50 mr-1">Team:</span>
			{{ ticket?.team.name }}
		</p>
	</div>
</template>

<script setup>
const props = defineProps({
	ticket: {
		type: Object,
		required: true,
	},
});
</script>
