<!-- components/Scheduler/VideoMeetings.vue -->
<script setup>
import { format } from 'date-fns';

const props = defineProps({
	meetings: { type: Array, default: () => [] },
});
const emit = defineEmits(['refresh']);

const toast = useToast();
const videoMeetingItems = useDirectusItems('video_meetings');

const showInviteModal = ref(false);
const selectedMeeting = ref(null);
const inviteTab = ref(0);

const inviteForm = reactive({ email: '', phone: '', name: '', message: '' });

const inviteTabs = [
	{ key: 'email', label: 'Email' },
	{ key: 'sms', label: 'SMS' },
	{ key: 'link', label: 'Copy Link' },
];

const formatEventTime = (dateStr) => {
	if (!dateStr) return '';
	return format(new Date(dateStr), 'EEE, MMM d · h:mm a');
};

const { getStatusColorName: getStatusColor } = useStatusStyle();

const copyMeetingLink = async (meeting) => {
	const url = meeting.meeting_url || `${window.location.origin}/meeting/${meeting.room_name}`;
	await navigator.clipboard.writeText(url);
	toast.add({ title: 'Link copied', color: 'green' });
};

const openInviteModal = (meeting) => {
	selectedMeeting.value = meeting;
	inviteTab.value = 0;
	Object.assign(inviteForm, {
		email: meeting.invitee_email || '',
		phone: meeting.invitee_phone || '',
		name: meeting.invitee_name || '',
		message: '',
	});
	showInviteModal.value = true;
};

const sendInvite = async () => {
	if (!selectedMeeting.value) return;
	
	try {
		if (inviteTab.value === 0 && inviteForm.email) {
			await $fetch('/api/video/send-email-invite', {
				method: 'POST',
				body: {
					meetingId: selectedMeeting.value.id,
					roomName: selectedMeeting.value.room_name,
					toEmail: inviteForm.email,
					toName: inviteForm.name,
					customMessage: inviteForm.message,
					scheduledStart: selectedMeeting.value.scheduled_start,
					hostName: selectedMeeting.value.host_identity,
				},
			});
			toast.add({ title: 'Email sent', color: 'green' });
		} else if (inviteTab.value === 1 && inviteForm.phone) {
			await $fetch('/api/video/send-invite', {
				method: 'POST',
				body: {
					roomName: selectedMeeting.value.room_name,
					phoneNumber: inviteForm.phone,
					customMessage: inviteForm.message,
				},
			});
			toast.add({ title: 'SMS sent', color: 'green' });
		}
		showInviteModal.value = false;
	} catch (error) {
		toast.add({ title: 'Error', description: error.message, color: 'red' });
	}
};

const cancelMeeting = async (meeting) => {
	if (!confirm('Cancel this meeting?')) return;
	try {
		await videoMeetingItems.update(meeting.id, { status: 'cancelled' });
		emit('refresh');
		toast.add({ title: 'Meeting cancelled', color: 'yellow' });
	} catch (error) {
		toast.add({ title: 'Error', color: 'red' });
	}
};

const getMeetingActions = (meeting) => [
	[
		{ label: 'Join', icon: 'i-heroicons-video-camera', click: () => window.open(`/meeting/${meeting.room_name}`, '_blank') },
		{ label: 'Send Invite', icon: 'i-heroicons-paper-airplane', click: () => openInviteModal(meeting) },
		{ label: 'Copy Link', icon: 'i-heroicons-link', click: () => copyMeetingLink(meeting) },
	],
	[{ label: 'Cancel', icon: 'i-heroicons-x-circle', click: () => cancelMeeting(meeting) }],
];
</script>

<template>
	<div>
		<div v-if="meetings.length === 0" class="text-center py-12">
			<UIcon name="i-heroicons-video-camera" class="w-12 h-12 mx-auto mb-4 text-gray-300" />
			<h3 class="text-lg font-medium mb-2">No video meetings scheduled</h3>
			<p class="text-gray-500">Create a video meeting to get started</p>
		</div>

		<div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			<UCard v-for="meeting in meetings" :key="meeting.id">
				<template #header>
					<div class="flex items-center justify-between">
						<span class="font-semibold truncate">{{ meeting.title }}</span>
						<UDropdown :items="getMeetingActions(meeting)">
							<UButton color="gray" variant="ghost" size="xs" icon="i-heroicons-ellipsis-vertical" />
						</UDropdown>
					</div>
				</template>
				
				<div class="space-y-3">
					<div class="flex items-center gap-2 text-sm text-gray-500">
						<UIcon name="i-heroicons-clock" class="w-4 h-4" />
						{{ formatEventTime(meeting.scheduled_start) }}
					</div>
					<div v-if="meeting.duration_minutes" class="flex items-center gap-2 text-sm text-gray-500">
						<UIcon name="i-heroicons-clock" class="w-4 h-4" />
						{{ meeting.duration_minutes }} minutes
					</div>
					<div v-if="meeting.invitee_name || meeting.invitee_email" class="flex items-center gap-2 text-sm text-gray-500">
						<UIcon name="i-heroicons-user" class="w-4 h-4" />
						{{ meeting.invitee_name || meeting.invitee_email }}
					</div>
					<UBadge :color="getStatusColor(meeting.status)" variant="soft" size="xs">{{ meeting.status }}</UBadge>
				</div>
				
				<template #footer>
					<div class="flex gap-2">
						<UButton size="sm" color="green" :to="`/meeting/${meeting.room_name}`" target="_blank" class="flex-1">Join</UButton>
						<UButton size="sm" color="gray" variant="soft" icon="i-heroicons-paper-airplane" @click="openInviteModal(meeting)" />
						<UButton size="sm" color="gray" variant="soft" icon="i-heroicons-link" @click="copyMeetingLink(meeting)" />
					</div>
				</template>
			</UCard>
		</div>

		<!-- Invite Modal -->
		<UModal v-model="showInviteModal">
			<UCard>
				<template #header>
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">Send Invite</h3>
						<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showInviteModal = false" />
					</div>
				</template>

				<div v-if="selectedMeeting" class="space-y-4">
					<div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
						<div class="font-medium">{{ selectedMeeting.title }}</div>
						<div class="text-sm text-gray-500">{{ formatEventTime(selectedMeeting.scheduled_start) }}</div>
					</div>

					<UTabs :items="inviteTabs" v-model="inviteTab">
						<template #item="{ item }">
							<div class="space-y-4 pt-4">
								<template v-if="item.key === 'email'">
									<UFormGroup label="Email" required><UInput v-model="inviteForm.email" type="email" /></UFormGroup>
									<UFormGroup label="Name"><UInput v-model="inviteForm.name" /></UFormGroup>
									<UFormGroup label="Message"><UTextarea v-model="inviteForm.message" rows="2" /></UFormGroup>
								</template>
								<template v-else-if="item.key === 'sms'">
									<UFormGroup label="Phone" required><UInput v-model="inviteForm.phone" type="tel" /></UFormGroup>
									<UFormGroup label="Message"><UTextarea v-model="inviteForm.message" rows="2" /></UFormGroup>
								</template>
								<template v-else>
									<UFormGroup label="Meeting Link">
										<div class="flex gap-2">
											<UInput :model-value="selectedMeeting.meeting_url || `${$config.public.siteUrl}/meeting/${selectedMeeting.room_name}`" readonly class="flex-1" />
											<UButton color="gray" icon="i-heroicons-clipboard" @click="copyMeetingLink(selectedMeeting)" />
										</div>
									</UFormGroup>
								</template>
							</div>
						</template>
					</UTabs>
				</div>

				<template #footer>
					<div class="flex justify-end gap-3">
						<UButton color="gray" variant="soft" @click="showInviteModal = false">Cancel</UButton>
						<UButton v-if="inviteTab !== 2" color="primary" @click="sendInvite">
							Send {{ inviteTab === 0 ? 'Email' : 'SMS' }}
						</UButton>
					</div>
				</template>
			</UCard>
		</UModal>
	</div>
</template>
