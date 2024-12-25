<template>
	<div class="w-full flex flex-row items-start justify-start flex-wrap min-h-svh">
		<div class="w-full flex items-end justify-end mb-4">
			<UButton icon="i-heroicons-plus" size="sm" @click="openAppointmentModal()">New Appointment</UButton>
		</div>
		<div class="w-full lg:w-1/2 flex-grow">
			<VCalendar
				v-model="selectedDate"
				@dayclick="dayClicked"
				:attributes="calendarAttributes"
				mode="month"
				class="calendar-container"
				expanded
				borderless
			>
				<template #day-content="{ day, attributes }">
					<div class="day-content-wrapper h-full p-1" @click="dayClicked(day)">
						<span class="w-4 text-center text-xs cursor-pointer hover:bg-gray-100 transition-all duration-100">
							{{ day.day }}
						</span>
						<div class="flex-grow overflow-y-auto relative">
							<div
								v-for="appointment in sortedAppointments(day)"
								:key="appointment.id"
								class="cursor-pointer appointment-title"
								:class="getAppointmentClass(appointment)"
								:style="{ height: `${appointment.duration * 50}px`, marginBottom: '4px' }"
								@click.stop="openEventDetails(appointment)"
							>
								<strong class="!font-bold">{{ getTime(appointment.start_time) }}</strong>
								: {{ appointment.title }}
							</div>
						</div>
					</div>
				</template>
			</VCalendar>
		</div>
		<div class="mt-4 lg:mt-0 w-full lg:w-1/2">
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-[10px] uppercase">Appointments for {{ formatDate(selectedDate) }}</h3>
				<!-- <UButton icon="i-heroicons-plus" size="xs" @click="openAppointmentModal()">New</UButton> -->
			</div>

			<div v-if="loading" class="text-center">Loading appointments...</div>
			<div v-else-if="error" class="text-center text-red-500">Error loading appointments: {{ error.message }}</div>
			<div v-else-if="filteredAppointments.length === 0" class="text-center">No appointments for this day.</div>
			<ul v-else class="space-y-2">
				<li
					v-for="appointment in filteredAppointments"
					:key="appointment.id"
					class="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
				>
					<div class="flex items-start justify-between">
						<div>
							<h4 class="">{{ appointment.title }}</h4>
							<p class="text-sm text-gray-600 dark:text-gray-300">
								{{ formatTime(appointment.start_time) }} - {{ formatTime(appointment.end_time) }}
							</p>
							<div v-if="appointment.description" class="text-sm mt-1" v-html="appointment.description" />
						</div>
						<UPopover :popper="{ placement: 'bottom-end' }">
							<UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-vertical" />
							<template #panel>
								<div class="p-2 flex flex-col gap-1">
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

		<UModal v-model="showAppointmentForm">
			<UCard>
				<CalendarAppointmentForm
					v-if="showAppointmentForm"
					:appointment="selectedAppointment"
					:selected-date="selectedDate"
					@saved="onAppointmentSaved"
					@cancelled="closeAppointmentModal"
				/>
			</UCard>
		</UModal>
	</div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';
import { format, parseISO, isEqual, startOfDay } from 'date-fns';

const { user } = useDirectusAuth();
const { deleteItem } = useDirectusItems();
const toast = useToast();
const showAppointmentForm = ref(false);
const selectedDate = ref(new Date());
const selectedAppointment = ref(null);
const appointments = ref([]);
const loading = ref(true);
const error = ref(null);

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
		toast.add({ title: 'Error', description: newError.message || 'Failed to load appointments', color: 'red' }); // Display toast error
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

const calendarAttributes = computed(() => {
	if (!appointments.value) return [];
	return appointments.value.map((appointment) => ({
		key: appointment.id,
		dates: parseISO(appointment.start_time),
		customData: appointment,
		// dot: {
		// 	color: getStatusColor(appointment.status),
		// },
	}));
});

function getTime(dateTime) {
	return format(parseISO(dateTime), 'h:mm a');
}

function dayClicked(day) {
	console.log('Day clicked:', day);
	if (day?.date) {
		selectedDate.value = day.date;
		console.log(selectedDate.value);
	} else {
		console.warn('The "day" object does not contain a "date" property:', day);
	}
}

function getStatusColor(status) {
	const colors = {
		pending: 'yellow',
		confirmed: 'green',
		cancelled: 'red',
	};
	return colors[status] || 'blue';
}

function getAppointmentClass(appointment) {
	return {
		'border-l-[5px] border-yellow-200 dark:border-yellow-800': appointment.status === 'pending',
		'border-l-[5px] bg-[var(--cyan)] border-[var(--cyan)]': appointment.status === 'confirmed',
		'border-l-[5px] border-red-200 dark:border-red-800': appointment.status === 'cancelled',
	};
}

const sortedAppointments = (day) => {
	const currentDayStart = day.date; // Use the date property directly
	const currentDayEnd = new Date(day.date);
	currentDayEnd.setHours(23, 59, 59, 999); // Set the end of the day

	console.log('Current Day Start:', currentDayStart);
	console.log('Current Day End:', currentDayEnd);
	console.log('All Appointments:', appointments.value);

	return appointments.value
		.filter((appointment) => {
			const start = new Date(appointment.start_time);
			const end = new Date(appointment.end_time);
			console.log('Appointment Start:', start, 'Appointment End:', end); // Log each appointment's start and end time
			return (
				(start >= currentDayStart && start <= currentDayEnd) ||
				(end >= currentDayStart && end <= currentDayEnd) ||
				(start <= currentDayStart && end >= currentDayEnd)
			);
		})
		.map((appointment) => {
			const start = new Date(appointment.start_time);
			const end = new Date(appointment.end_time);
			const durationInHours = (end - start) / (1000 * 60 * 60); // Convert milliseconds to hours
			return {
				...appointment,
				duration: durationInHours,
			};
		})
		.sort((a, b) => new Date(a.start_time) - new Date(b.start_time)); // Sort by start_time
};

function editAppointment(appointment) {
	selectedAppointment.value = appointment;
	openAppointmentModal();
}

function openEventDetails(eventData) {
	selectedAppointment.value = eventData; // Set the selected appointment
	showAppointmentForm.value = true; // Open the appointment modal or details view
	console.log('Event details opened for:', eventData);
}

async function deleteAppointment(id) {
	try {
		await deleteItem('appointments', id);
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

function formatDate(date) {
	return format(date, 'MMMM d, yyyy');
}

function formatTime(dateTime) {
	return format(parseISO(dateTime), 'h:mm a');
}
</script>

<style>
.calendar-container {
	@apply w-full overflow-hidden !font-body;
	height: calc(100vh - 12rem); /* Adjust based on your layout */
}

:deep(.vc-container) {
	height: 100%;
	--vc-header-title-size: 1rem;
}

:deep(.vc-weeks) {
	flex: 1;
}

:deep(.vc-title) {
	@apply uppercase;
}

:deep(.vc-header) {
	@apply bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700;
}

.day-content-wrapper {
	@apply flex flex-col h-full min-h-[5rem];
}

.appointment-title {
	padding-left: 5px; /* Space between border and text */
	background-color: rgba(198, 198, 198, 0.05); /* Optional: background color for better visibility */
	transition: background-color 0.3s; /* Optional: transition effect */
	font-size: 8px;
	line-height: 8px;
	@apply py-1 min-h-5;
}

.appointment-title:hover {
	background-color: rgba(198, 198, 198, 0.35); /* Optional: hover effect */
}

/* Hide scrollbar but keep functionality */
.day-content-wrapper > div {
	scrollbar-width: none;
	-ms-overflow-style: none;
}

.day-content-wrapper > div::-webkit-scrollbar {
	display: none;
}
</style>
