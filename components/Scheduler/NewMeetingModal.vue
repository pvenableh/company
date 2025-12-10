<!-- components/Scheduler/NewMeetingModal.vue -->
<script setup>
import { format } from 'date-fns';

const emit = defineEmits(['created']);
const schedulerData = inject('schedulerData');
const { user, settings } = schedulerData;

const toast = useToast();

const showModal = ref(false);
const saving = ref(false);

const form = reactive({
	title: '',
	description: '',
	is_video: true,
	meeting_type: 'general',
	start_time: '',
	duration: 30,
	status: 'pending',
	invite_method: 'email',
	invitee_email: '',
	invitee_phone: '',
	invitee_name: '',
});

const durationOptions = [
	{ label: '15 minutes', value: 15 },
	{ label: '30 minutes', value: 30 },
	{ label: '45 minutes', value: 45 },
	{ label: '60 minutes', value: 60 },
	{ label: '90 minutes', value: 90 },
];

const meetingTypeOptions = [
	{ label: 'Consultation', value: 'consultation' },
	{ label: 'Discovery Call', value: 'discovery' },
	{ label: 'Project Review', value: 'project_review' },
	{ label: 'Presentation', value: 'presentation' },
	{ label: 'General', value: 'general' },
];

const inviteMethodOptions = [
	{ label: 'Email', value: 'email' },
	{ label: 'SMS', value: 'sms' },
	{ label: 'Both', value: 'both' },
	{ label: 'None', value: 'none' },
];

const openModal = () => {
	Object.assign(form, {
		title: '',
		description: '',
		is_video: true,
		meeting_type: settings.value?.default_meeting_type || 'general',
		start_time: '',
		duration: settings.value?.default_duration || 30,
		status: 'pending',
		invite_method: 'email',
		invitee_email: '',
		invitee_phone: '',
		invitee_name: '',
	});
	
	const now = new Date();
	now.setHours(now.getHours() + 1, 0, 0, 0);
	form.start_time = format(now, "yyyy-MM-dd'T'HH:mm");
	
	showModal.value = true;
};

const saveMeeting = async () => {
	if (!form.title) {
		toast.add({ title: 'Title is required', color: 'red' });
		return;
	}
	
	saving.value = true;
	try {
		const startTime = new Date(form.start_time);
		const endTime = new Date(startTime.getTime() + form.duration * 60000);
		
		if (form.is_video) {
			await $fetch('/api/video/create-room', {
				method: 'POST',
				body: {
					title: form.title,
					description: form.description,
					meetingType: form.meeting_type,
					scheduledStart: startTime.toISOString(),
					scheduledEnd: endTime.toISOString(),
					durationMinutes: form.duration,
					hostName: `${user.value?.first_name} ${user.value?.last_name}`,
					hostUserId: user.value?.id,
					inviteeEmail: form.invitee_email || undefined,
					inviteePhone: form.invitee_phone || undefined,
					inviteeName: form.invitee_name || undefined,
					inviteMethod: form.invite_method,
					createAppointment: true,
				},
			});
			toast.add({ title: 'Video meeting created', color: 'green' });
		} else {
			const { createItem } = useDirectusItems();
			await createItem('appointments', {
				title: form.title,
				description: form.description,
				start_time: startTime.toISOString(),
				end_time: endTime.toISOString(),
				status: form.status,
				is_video: false,
			});
			toast.add({ title: 'Appointment created', color: 'green' });
		}
		
		showModal.value = false;
		emit('created');
	} catch (error) {
		toast.add({ title: 'Error', description: error.message, color: 'red' });
	}
	saving.value = false;
};
</script>

<template>
	<div>
		<UButton color="primary" icon="i-heroicons-plus" @click="openModal">New Meeting</UButton>

		<UModal v-model="showModal">
			<UCard>
				<template #header>
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">New Meeting</h3>
						<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showModal = false" />
					</div>
				</template>

				<form @submit.prevent="saveMeeting" class="space-y-4">
					<UFormGroup label="Title" required>
						<UInput v-model="form.title" placeholder="Meeting title" />
					</UFormGroup>

					<UFormGroup label="Description">
						<UTextarea v-model="form.description" placeholder="Description" rows="2" />
					</UFormGroup>

					<div class="flex items-center gap-4">
						<UFormGroup label="Video Meeting">
							<UToggle v-model="form.is_video" />
						</UFormGroup>
						<UFormGroup v-if="form.is_video" label="Type" class="flex-1">
							<USelect v-model="form.meeting_type" :options="meetingTypeOptions" />
						</UFormGroup>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<UFormGroup label="Start Time" required>
							<UInput v-model="form.start_time" type="datetime-local" />
						</UFormGroup>
						<UFormGroup label="Duration">
							<USelect v-model="form.duration" :options="durationOptions" />
						</UFormGroup>
					</div>

					<template v-if="form.is_video">
						<UFormGroup label="Invite Method">
							<USelect v-model="form.invite_method" :options="inviteMethodOptions" />
						</UFormGroup>
						<div v-if="form.invite_method !== 'none'" class="space-y-4">
							<UFormGroup v-if="['email', 'both'].includes(form.invite_method)" label="Invitee Email">
								<UInput v-model="form.invitee_email" type="email" placeholder="guest@example.com" />
							</UFormGroup>
							<UFormGroup v-if="['sms', 'both'].includes(form.invite_method)" label="Invitee Phone">
								<UInput v-model="form.invitee_phone" type="tel" placeholder="+1 (555) 000-0000" />
							</UFormGroup>
							<UFormGroup label="Invitee Name">
								<UInput v-model="form.invitee_name" placeholder="Guest name" />
							</UFormGroup>
						</div>
					</template>
				</form>

				<template #footer>
					<div class="flex justify-end gap-3">
						<UButton color="gray" variant="soft" @click="showModal = false">Cancel</UButton>
						<UButton color="primary" :loading="saving" @click="saveMeeting">Create</UButton>
					</div>
				</template>
			</UCard>
		</UModal>
	</div>
</template>
