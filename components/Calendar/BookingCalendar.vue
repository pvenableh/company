<template>
	<div
		class="w-full flex flex-row items-start justify-start flex-wrap min-h-svh"
		@keydown="handleKeyDown"
		tabindex="0"
		ref="calendarContainer"
	>
		<div class="mt-12 w-full grid grid-cols-1 md:grid-cols-2 h-full max-w-[2000px] mx-auto">
			<div class="max-h-[600px]">
				<CalendarRoot
					v-model="calendarValue"
					v-model:placeholder="calendarPlaceholder"
					class="calendar-container"
					v-slot="{ grid, weekDays, date }"
				>
					<CalendarHeader class="flex items-center justify-between px-2 pb-2">
						<CalendarPrevButton />
						<CalendarHeading class="uppercase text-gray-600 font-normal font-body tracking-wider text-[14px]" />
						<CalendarNextButton />
					</CalendarHeader>

					<div class="w-full">
						<CalendarGrid v-for="month in grid" :key="month.value.toString()" class="w-full border-collapse">
							<CalendarGridHead>
								<CalendarGridRow class="flex w-full border-t border-gray-100">
									<CalendarHeadCell
										v-for="day in weekDays"
										:key="day"
										class="flex-1 uppercase text-gray-600 font-normal font-body tracking-wider text-[10px] leading-[10px] py-3 text-center"
									>
										{{ day }}
									</CalendarHeadCell>
								</CalendarGridRow>
							</CalendarGridHead>
							<CalendarGridBody>
								<CalendarGridRow v-for="(weekDates, index) in month.rows" :key="`weekDate-${index}`" class="flex w-full">
									<CalendarCell
										v-for="weekDate in weekDates"
										:key="weekDate.toString()"
										:date="weekDate"
										class="relative flex-1 border-t border-gray-50 p-0"
										:class="{ 'bg-gray-100': isToday(weekDate) }"
									>
										<div
											class="day-content-wrapper h-full p-1"
											@click="dayClickedFromCalendar(weekDate)"
											@dblclick="handleDayDoubleClickFromCalendar(weekDate)"
										>
											<span
												class="w-4 text-center text-xs cursor-pointer hover:bg-gray-100 transition-all duration-100"
												:class="{
													'font-bold text-primary': isSelected(weekDate),
													'text-muted-foreground': isOutsideMonth(weekDate, month.value),
												}"
											>
												{{ weekDate.day }}
											</span>
											<span
												v-if="sortedAppointmentsForDate(weekDate).length > 0"
												class="text-[8px] font-bold absolute top-0 right-0 uppercase text-gray-400 pr-2 pt-[6px] rounded-full"
											>
												{{ sortedAppointmentsForDate(weekDate).length }}
												{{ sortedAppointmentsForDate(weekDate).length === 1 ? 'event' : 'events' }}
											</span>
											<div class="flex-grow overflow-y-auto relative">
												<div
													v-for="appointment in sortedAppointmentsForDate(weekDate)"
													:key="appointment.id"
													class="cursor-pointer appointment-title"
													:class="[
														getAppointmentClass(appointment),
														{ 'appointment-selected': selectedAppointmentId === appointment.id },
													]"
													:style="{ marginBottom: '4px' }"
													@click.stop="handleAppointmentClick(appointment)"
													@dblclick.stop="handleAppointmentDoubleClick(appointment)"
												>
													<div class="flex items-center gap-1">
														<UIcon
															v-if="appointment.is_video"
															name="i-heroicons-video-camera"
															class="w-3 h-3 text-green-500 flex-shrink-0"
														/>
														<span>
															<strong class="!font-bold">{{ getTime(appointment.start_time) }}</strong>
															: {{ appointment.title }}
														</span>
													</div>
												</div>
											</div>
										</div>
									</CalendarCell>
								</CalendarGridRow>
							</CalendarGridBody>
						</CalendarGrid>
					</div>
				</CalendarRoot>
			</div>
			<div class="mt-4 lg:mt-0 px-6 max-h-[600px]">
				<div class="w-full flex items-end justify-end mb-4 gap-2">
					<UButton
						icon="i-heroicons-video-camera"
						size="sm"
						color="green"
						variant="soft"
						@click="openVideoMeetingModal()"
					>
						Video Meeting
					</UButton>
					<UButton icon="i-heroicons-plus" size="sm" @click="openAppointmentModal()">New Appointment</UButton>
				</div>
				<div v-if="filteredAppointments.length !== 0" class="flex items-center justify-between mb-4">
					<h3 class="text-[10px] uppercase">
						Appointments for
						<strong>{{ formatDate(selectedDate) }}</strong>
						:
					</h3>
				</div>

				<div v-if="loading" class="text-center uppercase text-[10px]">Loading appointments...</div>
				<div v-else-if="error" class="text-center text-red-500">Error loading appointments: {{ error.message }}</div>
				<div
					v-else-if="filteredAppointments.length === 0"
					class="h-full w-full flex flex-col items-center justify-center"
				>
					<p class="text-center uppercase">No appointments for {{ formatDate(selectedDate) }}.</p>
					<p class="mt-4 font-signature">Maybe a good day to hit the beach...🌴🏖️🌊</p>
					<UIcon name="i-heroicons-sun-solid" class="w-8 h-8 mt-4" style="color: #ffdf01" />
				</div>
				<ul v-else class="space-y-2">
					<li
						v-for="appointment in filteredAppointments"
						:key="appointment.id"
						class="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
					>
						<div class="flex items-start justify-between">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<!-- Video badge -->
									<UBadge v-if="appointment.is_video" color="green" variant="soft" size="xs">
										<UIcon name="i-heroicons-video-camera" class="w-3 h-3 mr-1" />
										Video
									</UBadge>
									<h4 class="uppercase text-sm">{{ appointment.title }}</h4>
								</div>
								<p class="text-xs text-gray-600 dark:text-gray-300 font-bold mt-1">
									{{ formatTime(appointment.start_time) }} - {{ formatTime(appointment.end_time) }}
								</p>
								<div v-if="appointment.description" class="text-xs mt-2" v-html="appointment.description" />

								<!-- Join meeting button for video appointments -->
								<div v-if="appointment.is_video && appointment.meeting_link" class="mt-3">
									<UButton
										size="xs"
										color="green"
										:to="appointment.meeting_link"
										target="_blank"
										icon="i-heroicons-video-camera"
									>
										Join Meeting
									</UButton>
									<UButton
										size="xs"
										color="gray"
										variant="ghost"
										icon="i-heroicons-clipboard"
										class="ml-2"
										@click.stop="copyMeetingLink(appointment.meeting_link)"
									>
										Copy Link
									</UButton>
								</div>
							</div>
							<UPopover :popper="{ placement: 'bottom-end' }">
								<UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-vertical" />
								<template #panel>
									<div class="p-2 flex flex-col gap-1">
										<UButton
											v-if="appointment.is_video && appointment.meeting_link"
											class="w-full justify-start"
											color="green"
											variant="ghost"
											icon="i-heroicons-video-camera"
											:to="appointment.meeting_link"
											target="_blank"
										>
											Join Meeting
										</UButton>
										<UButton
											class="w-full justify-start"
											color="gray"
											variant="ghost"
											icon="i-heroicons-pencil"
											@click="editAppointment(appointment)"
										>
											Edit
										</UButton>
										<UButton
											class="w-full justify-start"
											color="red"
											variant="ghost"
											icon="i-heroicons-trash"
											@click="deleteAppointment(appointment.id)"
										>
											Delete
										</UButton>
									</div>
								</template>
							</UPopover>
						</div>
					</li>
				</ul>
			</div>
		</div>

		<!-- Appointment Form Modal -->
		<UModal v-model="showAppointmentForm">
			<div v-if="showAppointmentForm" class="">
				<CalendarAppointmentForm
					:appointment="selectedAppointment"
					:selected-date="selectedDate"
					@saved="onAppointmentSaved"
					@cancelled="closeAppointmentModal"
				/>
			</div>
		</UModal>

		<!-- Video Meeting Modal -->
		<UModal v-model="showVideoMeetingForm">
			<div v-if="showVideoMeetingForm" class="p-6">
				<h3 class="text-lg font-semibold mb-4">Create Video Meeting</h3>
				<form @submit.prevent="createVideoMeeting" class="space-y-4">
					<UFormGroup label="Title" required>
						<UInput v-model="videoForm.title" placeholder="Meeting title" />
					</UFormGroup>

					<div class="grid grid-cols-2 gap-4">
						<UFormGroup label="Date" required>
							<UInput type="date" v-model="videoForm.date" />
						</UFormGroup>
						<UFormGroup label="Time" required>
							<UInput type="time" v-model="videoForm.time" />
						</UFormGroup>
					</div>

					<UFormGroup label="Duration">
						<USelect
							v-model="videoForm.duration"
							:options="[
								{ label: '15 minutes', value: 15 },
								{ label: '30 minutes', value: 30 },
								{ label: '45 minutes', value: 45 },
								{ label: '60 minutes', value: 60 },
							]"
						/>
					</UFormGroup>

					<UFormGroup label="Description">
						<UTextarea v-model="videoForm.description" placeholder="Meeting description" rows="2" />
					</UFormGroup>

					<UDivider label="Invite Guest (Optional)" />

					<div class="grid grid-cols-2 gap-4">
						<UFormGroup label="Guest Name">
							<UInput v-model="videoForm.invitee_name" placeholder="John Doe" />
						</UFormGroup>
						<UFormGroup label="Guest Email">
							<UInput v-model="videoForm.invitee_email" type="email" placeholder="john@example.com" />
						</UFormGroup>
					</div>

					<UFormGroup label="Send Invite Via">
						<USelect
							v-model="videoForm.invite_method"
							:options="[
								{ label: 'Don\'t send invite', value: 'none' },
								{ label: 'Email', value: 'email' },
								{ label: 'SMS', value: 'sms' },
								{ label: 'Both', value: 'both' },
							]"
						/>
					</UFormGroup>

					<div class="flex justify-end gap-2 pt-4">
						<UButton color="gray" variant="soft" @click="closeVideoMeetingModal">Cancel</UButton>
						<UButton type="submit" color="green" :loading="creatingVideo" icon="i-heroicons-video-camera">
							Create Meeting
						</UButton>
					</div>
				</form>
			</div>
		</UModal>
	</div>
</template>

<script setup>
import { format, parseISO, isEqual, startOfDay } from 'date-fns';
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date';
import { CalendarRoot } from 'reka-ui';
import {
	CalendarCell,
	CalendarGrid,
	CalendarGridBody,
	CalendarGridHead,
	CalendarGridRow,
	CalendarHeadCell,
	CalendarHeader,
	CalendarHeading,
	CalendarNextButton,
	CalendarPrevButton,
} from '~/components/ui/calendar';

const { user } = useDirectusAuth();
const appointmentItems = useDirectusItems('appointments');
const toast = useToast();
const showAppointmentForm = ref(false);
const showVideoMeetingForm = ref(false);
const selectedDate = ref(new Date());
const selectedAppointment = ref(null);
const calendarContainer = ref(null);
const selectedAppointmentId = ref(null);
const appointments = ref([]);
const loading = ref(true);
const error = ref(null);
const creatingVideo = ref(false);

// Bridge between native Date and @internationalized/date CalendarDate
const calendarPlaceholder = ref(today(getLocalTimeZone()));

const calendarValue = computed({
	get() {
		const d = selectedDate.value;
		return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
	},
	set(val) {
		if (val) {
			selectedDate.value = new Date(val.year, val.month - 1, val.day);
		}
	},
});

function dateValueToNative(dateValue) {
	return new Date(dateValue.year, dateValue.month - 1, dateValue.day);
}

function isToday(dateValue) {
	const t = today(getLocalTimeZone());
	return dateValue.year === t.year && dateValue.month === t.month && dateValue.day === t.day;
}

function isSelected(dateValue) {
	const d = selectedDate.value;
	return dateValue.year === d.getFullYear() && dateValue.month === d.getMonth() + 1 && dateValue.day === d.getDate();
}

function isOutsideMonth(dateValue, monthValue) {
	return dateValue.month !== monthValue.month;
}

function dayClickedFromCalendar(dateValue) {
	selectedAppointmentId.value = null;
	selectedDate.value = dateValueToNative(dateValue);
}

function handleDayDoubleClickFromCalendar(dateValue) {
	selectedDate.value = dateValueToNative(dateValue);
	openAppointmentModal();
}

const sortedAppointmentsForDate = (dateValue) => {
	const nativeDate = dateValueToNative(dateValue);
	const currentDayStart = nativeDate;
	const currentDayEnd = new Date(nativeDate);
	currentDayEnd.setHours(23, 59, 59, 999);

	return appointments.value
		.filter((appointment) => {
			const start = new Date(appointment.start_time);
			const end = new Date(appointment.end_time);
			return (
				(start >= currentDayStart && start <= currentDayEnd) ||
				(end >= currentDayStart && end <= currentDayEnd) ||
				(start <= currentDayStart && end >= currentDayEnd)
			);
		})
		.map((appointment) => {
			const start = new Date(appointment.start_time);
			const end = new Date(appointment.end_time);
			const durationInHours = (end - start) / (1000 * 60 * 60);
			return {
				...appointment,
				duration: durationInHours,
			};
		})
		.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
};

// Video meeting form
const videoForm = reactive({
	title: '',
	date: format(new Date(), 'yyyy-MM-dd'),
	time: '09:00',
	duration: 30,
	description: '',
	invitee_name: '',
	invitee_email: '',
	invitee_phone: '',
	invite_method: 'none',
});

const {
	data: realtimeAppointments,
	error: subscriptionError,
	refresh,
} = useRealtimeSubscription(
	'appointments',
	[
		'id',
		'title',
		'description',
		'start_time',
		'end_time',
		'status',
		'is_video',
		'meeting_link',
		'room_name',
		'video_meeting.id',
		'video_meeting.room_name',
		'attendees.id',
		'attendees.directus_users_id.id',
		'attendees.directus_users_id.first_name',
		'attendees.directus_users_id.last_name',
		'attendees.directus_users_id.email',
		'user_created.*',
	],
	{
		_or: [
			{ user_created: { id: { _eq: user.value?.id } } },
			{ attendees: { directus_users_id: { _eq: user.value?.id } } },
		],
	},
);

watch(subscriptionError, (newError) => {
	if (newError) {
		error.value = newError;
		loading.value = false;
		console.error('Subscription Error:', newError);
		toast.add({ title: 'Error', description: newError.message || 'Failed to load appointments', color: 'red' });
	}
});

watch(
	realtimeAppointments,
	(newAppointments) => {
		if (newAppointments) {
			appointments.value = newAppointments;
		}
		loading.value = false;
	},
	{ immediate: true },
);

const filteredAppointments = computed(() => {
	if (!appointments.value) return [];
	return appointments.value.filter((appointment) => {
		const appointmentDate = startOfDay(parseISO(appointment.start_time));
		const selected = startOfDay(selectedDate.value);
		return isEqual(appointmentDate, selected);
	});
});

function getTime(dateTime) {
	return format(parseISO(dateTime), 'h:mm a');
}

function handleAppointmentClick(appointment) {
	selectedAppointmentId.value = selectedAppointmentId.value === appointment.id ? null : appointment.id;
	calendarContainer.value?.focus();
}

function handleAppointmentDoubleClick(appointment) {
	editAppointment(appointment);
}

async function handleKeyDown(event) {
	if ((event.key === 'Delete' || event.key === 'Backspace') && selectedAppointmentId.value) {
		await deleteAppointment(selectedAppointmentId.value);
		selectedAppointmentId.value = null;
	} else if (event.key === 'Escape') {
		selectedAppointmentId.value = null;
	}
}

function getAppointmentClass(appointment) {
	return {
		'border-l-[5px] border-yellow-200 dark:border-yellow-800': appointment.status === 'pending',
		'border-l-[5px] bg-[var(--cyan)] border-[var(--cyan)]': appointment.status === 'confirmed',
		'border-l-[5px] border-red-200 dark:border-red-800': appointment.status === 'cancelled',
		'border-l-[5px] border-green-400 dark:border-green-600': appointment.is_video, // Green border for video meetings
	};
}

function editAppointment(appointment) {
	selectedAppointment.value = appointment;
	openAppointmentModal();
}

async function deleteAppointment(id) {
	try {
		await appointmentItems.remove(id);
		refresh();
		toast.add({ title: 'Success', description: 'Appointment deleted', color: 'green' });
	} catch (err) {
		console.error('Error deleting appointment:', err);
		toast.add({ title: 'Error', description: 'Failed to delete appointment', color: 'red' });
	}
}

function onAppointmentSaved() {
	closeAppointmentModal();
	selectedAppointment.value = null;
	refresh();
}

function openAppointmentModal() {
	showAppointmentForm.value = true;
}

function closeAppointmentModal() {
	showAppointmentForm.value = false;
	selectedAppointment.value = null;
}

function openVideoMeetingModal() {
	// Pre-fill date with selected date
	videoForm.date = format(selectedDate.value, 'yyyy-MM-dd');
	videoForm.title = '';
	videoForm.time = '09:00';
	videoForm.duration = 30;
	videoForm.description = '';
	videoForm.invitee_name = '';
	videoForm.invitee_email = '';
	videoForm.invite_method = 'none';
	showVideoMeetingForm.value = true;
}

function closeVideoMeetingModal() {
	showVideoMeetingForm.value = false;
}

async function createVideoMeeting() {
	if (!videoForm.title) {
		toast.add({ title: 'Title is required', color: 'red' });
		return;
	}

	creatingVideo.value = true;
	try {
		const scheduledStart = new Date(`${videoForm.date}T${videoForm.time}`);

		const response = await $fetch('/api/video/create-room', {
			method: 'POST',
			body: {
				title: videoForm.title,
				description: videoForm.description,
				scheduled_start: scheduledStart.toISOString(),
				duration: videoForm.duration,
				invitee_name: videoForm.invitee_name,
				invitee_email: videoForm.invitee_email,
				invitee_phone: videoForm.invitee_phone,
				invite_method: videoForm.invite_method,
			},
		});

		toast.add({
			title: 'Video meeting created!',
			description: 'Meeting link copied to clipboard',
			color: 'green',
		});

		// Copy meeting link to clipboard
		if (response.data?.meetingLink) {
			await navigator.clipboard.writeText(response.data.meetingLink);
		}

		closeVideoMeetingModal();
		refresh(); // Refresh calendar to show new appointment
	} catch (err) {
		console.error('Error creating video meeting:', err);
		toast.add({ title: 'Error', description: err.message || 'Failed to create video meeting', color: 'red' });
	}
	creatingVideo.value = false;
}

async function copyMeetingLink(link) {
	await navigator.clipboard.writeText(link);
	toast.add({ title: 'Meeting link copied!', color: 'green' });
}

function formatDate(date) {
	return format(date, 'MMMM d, yyyy');
}

function formatTime(dateTime) {
	return format(parseISO(dateTime), 'h:mm a');
}

onUnmounted(() => {
	selectedAppointmentId.value = null;
});
</script>

<style>
@reference "~/assets/css/tailwind.css";
.calendar-container {
	@apply w-full overflow-hidden font-body p-0;
	height: calc(100vh - 12rem);

	.appointment-title {
		padding-left: 5px;
		background-color: rgba(198, 198, 198, 0.05);
		transition: background-color 0.3s;
		font-size: 8px;
		line-height: 8px;
		@apply py-1 min-h-5;
	}

	.appointment-title:hover {
		background-color: rgba(198, 198, 198, 0.35);
	}
	.appointment-selected {
		background-color: rgba(198, 198, 198, 0.32);
	}
}
.calendar-container:focus {
	@apply outline-none ring-1 ring-primary;
}

.day-content-wrapper {
	@apply flex flex-col h-full min-h-[5rem] max-h-[180px];
}

.day-content-wrapper > div {
	scrollbar-width: none;
	-ms-overflow-style: none;
}

.day-content-wrapper > div::-webkit-scrollbar {
	display: none;
}
</style>
