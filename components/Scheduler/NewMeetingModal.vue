<!-- components/Scheduler/NewMeetingModal.vue -->
<template>
	<UModal v-model="isOpen" :ui="{ width: 'max-w-2xl' }">
		<UCard>
			<template #header>
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-semibold">Create Video Meeting</h3>
					<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="close" />
				</div>
			</template>

			<form @submit.prevent="createMeeting" class="space-y-6">
				<!-- Title -->
				<UFormGroup label="Meeting Title" required>
					<UInput v-model="form.title" placeholder="Project discussion" size="lg" />
				</UFormGroup>

				<!-- Date/Time -->
				<div class="grid grid-cols-3 gap-4">
					<UFormGroup label="Date" required>
						<UInput type="date" v-model="form.date" />
					</UFormGroup>
					<UFormGroup label="Start Time" required>
						<UInput type="time" v-model="form.time" />
					</UFormGroup>
					<UFormGroup label="Duration">
						<USelect v-model="form.duration" :options="durationOptions" />
					</UFormGroup>
				</div>

				<!-- Description -->
				<UFormGroup label="Description">
					<UTextarea v-model="form.description" placeholder="Meeting agenda..." :rows="2" />
				</UFormGroup>

				<!-- Settings -->
				<div class="flex items-center gap-6">
					<UCheckbox v-model="form.waiting_room_enabled" label="Enable waiting room" />
				</div>

				<UDivider label="Invite Attendees" />

				<!-- Attendees List -->
				<div class="space-y-3">
					<div
						v-for="(attendee, index) in form.attendees"
						:key="index"
						class="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
					>
						<div class="flex-1 grid grid-cols-2 gap-3">
							<UFormGroup label="Name">
								<UInput v-model="attendee.name" placeholder="John Doe" size="sm" />
							</UFormGroup>
							<UFormGroup label="Email">
								<UInput v-model="attendee.email" type="email" placeholder="john@example.com" size="sm" />
							</UFormGroup>
							<UFormGroup label="Phone (optional)">
								<UInput v-model="attendee.phone" type="tel" placeholder="+1234567890" size="sm" />
							</UFormGroup>
							<UFormGroup label="Send Invite">
								<USelect v-model="attendee.invite_method" :options="inviteMethodOptions" size="sm" />
							</UFormGroup>
						</div>
						<UButton color="red" variant="ghost" icon="i-heroicons-trash" size="sm" @click="removeAttendee(index)" />
					</div>

					<!-- Add Attendee Button -->
					<UButton color="gray" variant="outline" icon="i-heroicons-plus" block @click="addAttendee">
						Add Attendee
					</UButton>
				</div>

				<!-- Custom Message -->
				<UFormGroup v-if="hasInvites" label="Custom Message (optional)">
					<UTextarea v-model="form.custom_message" placeholder="Looking forward to meeting with you!" :rows="2" />
				</UFormGroup>

				<!-- Actions -->
				<div class="flex justify-end gap-3 pt-4">
					<UButton color="gray" variant="soft" @click="close">Cancel</UButton>
					<UButton type="submit" color="green" :loading="creating" icon="i-heroicons-video-camera">
						Create Meeting
					</UButton>
				</div>
			</form>
		</UCard>
	</UModal>
</template>

<script setup lang="ts">
import { format } from 'date-fns';

const props = defineProps<{
	modelValue: boolean;
	selectedDate?: Date;
}>();

const emit = defineEmits(['update:modelValue', 'created']);

const toast = useToast();
const creating = ref(false);

const isOpen = computed({
	get: () => props.modelValue,
	set: (value) => emit('update:modelValue', value),
});

const durationOptions = [
	{ label: '15 minutes', value: 15 },
	{ label: '30 minutes', value: 30 },
	{ label: '45 minutes', value: 45 },
	{ label: '60 minutes', value: 60 },
	{ label: '90 minutes', value: 90 },
];

const inviteMethodOptions = [
	{ label: "Don't send", value: 'none' },
	{ label: 'Email', value: 'email' },
	{ label: 'SMS', value: 'sms' },
	{ label: 'Both', value: 'both' },
];

const form = reactive({
	title: '',
	date: format(new Date(), 'yyyy-MM-dd'),
	time: '09:00',
	duration: 30,
	description: '',
	waiting_room_enabled: true,
	custom_message: '',
	attendees: [] as Array<{
		name: string;
		email: string;
		phone: string;
		invite_method: string;
	}>,
});

// Watch for selectedDate changes
watch(
	() => props.selectedDate,
	(newDate) => {
		if (newDate) {
			form.date = format(newDate, 'yyyy-MM-dd');
		}
	},
	{ immediate: true },
);

const hasInvites = computed(() => {
	return form.attendees.some((a) => a.invite_method !== 'none' && (a.email || a.phone));
});

const addAttendee = () => {
	form.attendees.push({
		name: '',
		email: '',
		phone: '',
		invite_method: 'email',
	});
};

const removeAttendee = (index: number) => {
	form.attendees.splice(index, 1);
};

const resetForm = () => {
	form.title = '';
	form.date = format(props.selectedDate || new Date(), 'yyyy-MM-dd');
	form.time = '09:00';
	form.duration = 30;
	form.description = '';
	form.waiting_room_enabled = true;
	form.custom_message = '';
	form.attendees = [];
};

const close = () => {
	isOpen.value = false;
	resetForm();
};

const createMeeting = async () => {
	if (!form.title.trim()) {
		toast.add({ title: 'Please enter a meeting title', color: 'red' });
		return;
	}

	creating.value = true;
	try {
		const scheduledStart = new Date(`${form.date}T${form.time}`);

		const response = await $fetch('/api/video/create-room', {
			method: 'POST',
			body: {
				title: form.title,
				description: form.description,
				scheduled_start: scheduledStart.toISOString(),
				duration: form.duration,
				waiting_room_enabled: form.waiting_room_enabled,
				custom_message: form.custom_message,
				attendees: form.attendees.filter((a) => a.name || a.email),
			},
		});

		toast.add({
			title: 'Video meeting created!',
			description: 'Meeting link copied to clipboard',
			color: 'green',
		});

		// Copy meeting link
		if (response.data?.meetingLink) {
			await navigator.clipboard.writeText(response.data.meetingLink);
		}

		emit('created', response.data);
		close();
	} catch (error: any) {
		console.error('Error creating meeting:', error);
		toast.add({
			title: 'Error creating meeting',
			description: error.message,
			color: 'red',
		});
	}
	creating.value = false;
};

// Add one attendee by default when opening
watch(isOpen, (open) => {
	if (open && form.attendees.length === 0) {
		addAttendee();
	}
});
</script>
