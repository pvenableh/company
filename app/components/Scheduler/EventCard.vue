<!-- components/Scheduler/EventCard.vue -->
<script setup>
import { format } from 'date-fns';

const props = defineProps({
	event: { type: Object, required: true },
	compact: { type: Boolean, default: false },
});

const emit = defineEmits(['refresh']);
const toast = useToast();

const formatEventTime = (dateStr) => {
	if (!dateStr) return '';
	return format(new Date(dateStr), 'EEE, MMM d · h:mm a');
};

const getStatusColor = (status) => {
	const colors = {
		confirmed: 'green',
		scheduled: 'green',
		pending: 'yellow',
		canceled: 'red',
		cancelled: 'red',
		completed: 'gray',
		in_progress: 'blue',
	};
	return colors[status] || 'blue';
};

const copyMeetingLink = async () => {
	const url = props.event.video_meeting?.meeting_url || `${window.location.origin}/meeting/${props.event.video_meeting?.room_name}`;
	await navigator.clipboard.writeText(url);
	toast.add({ title: 'Link copied', color: 'green' });
};
</script>

<template>
	<div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition">
		<div class="flex items-center gap-2 mb-1">
			<UIcon
				:name="event.is_video ? 'i-heroicons-video-camera' : 'i-heroicons-calendar'"
				:class="event.is_video ? 'text-green-500' : 'text-blue-500'"
				class="w-4 h-4 flex-shrink-0"
			/>
			<span class="font-medium text-sm truncate">{{ event.title }}</span>
		</div>
		<div class="text-xs text-gray-500">{{ formatEventTime(event.start_time) }}</div>
		
		<div v-if="!compact" class="mt-2 flex items-center gap-2">
			<UBadge :color="getStatusColor(event.status)" variant="soft" size="xs">{{ event.status }}</UBadge>
			<template v-if="event.is_video && event.video_meeting">
				<UButton size="2xs" color="green" variant="soft" :to="`/meeting/${event.video_meeting.room_name}`" target="_blank">Join</UButton>
				<UButton size="2xs" color="gray" variant="ghost" icon="i-heroicons-link" @click.stop="copyMeetingLink" />
			</template>
		</div>
	</div>
</template>
