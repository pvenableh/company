<template>
	<div
		class="w-full flex flex-row items-start justify-start flex-wrap min-h-svh"
		@keydown="handleKeyDown"
		tabindex="0"
		ref="calendarContainer"
	>
		<div class="mt-12 w-full grid grid-cols-1 md:grid-cols-2 h-full max-w-[2000px] mx-auto">
			<div class="max-h-[600px]">
				<VCalendar
					v-model="selectedDate"
					@dayclick="dayClicked"
					:attributes="calendarAttributes"
					mode="month"
					color="gray"
					class="calendar-container"
					expanded
					transparent
					borderless
				>
					<template #day-content="{ day, attributes }">
						<div class="day-content-wrapper h-full p-1" @click="dayClicked(day)" @dblclick="handleDayDoubleClick(day)">
							<span class="w-4 text-center text-xs cursor-pointer hover:bg-gray-100 transition-all duration-100">
								{{ day.day }}
							</span>
							<span
								v-if="sortedAppointments(day).length > 0"
								class="text-[8px] font-bold absolute top-0 right-0 uppercase text-gray-400 pr-2 pt-[6px] rounded-full"
							>
								{{ sortedAppointments(day).length }}
								{{ sortedAppointments(day).length === 1 ? 'event' : 'events' }}
							</span>
							<div class="flex-grow overflow-y-auto relative">
								<!-- :style="{ height: `${appointment.duration * 20}px`, marginBottom: '4px' }" -->
								<div
									v-for="appointment in sortedAppointments(day)"
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
									<strong class="!font-bold">{{ getTime(appointment.start_time) }}</strong>
									: {{ appointment.title }}
								</div>
							</div>
						</div>
					</template>
				</VCalendar>
			</div>
			<div class="mt-4 lg:mt-0 px-6 max-h-[600px]">
				<div class="w-full flex items-end justify-end mb-4">
					<UButton icon="i-heroicons-plus" size="sm" @click="openAppointmentModal()">New Appointment</UButton>
				</div>
				<div v-if="filteredAppointments.length !== 0" class="flex items-center justify-between mb-4">
					<h3 class="text-[10px] uppercase">
						Appointments for
						<strong>{{ formatDate(selectedDate) }}</strong>
						:
					</h3>
					<!-- <UButton icon="i-heroicons-plus" size="xs" @click="openAppointmentModal()">New</UButton> -->
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
							<div>
								<h4 class="uppercase text-sm">{{ appointment.title }}</h4>
								<p class="text-xs text-gray-600 dark:text-gray-300 font-bold">
									{{ formatTime(appointment.start_time) }} - {{ formatTime(appointment.end_time) }}
								</p>
								<div v-if="appointment.description" class="text-xs mt-2" v-html="appointment.description" />
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
		</div>
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
	</div>
</template>

<script setup>
import { format, parseISO, isEqual, startOfDay } from 'date-fns';

const { user } = useEnhancedAuth();
const { deleteItem } = useDirectusItems();
const toast = useToast();
const showAppointmentForm = ref(false);
const selectedDate = ref(new Date());
const selectedAppointment = ref(null);
const calendarContainer = ref(null);
const selectedAppointmentId = ref(null);
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
	console.log('day clicked');
	selectedAppointmentId.value = null;
	if (day?.date) {
		selectedDate.value = day.date;
	}
}

function handleAppointmentClick(appointment) {
	// Toggle selection
	console.log(appointment);
	selectedAppointmentId.value = selectedAppointmentId.value === appointment.id ? null : appointment.id;
	console.log(selectedAppointmentId.value);
	// Focus the container to enable keyboard events
	calendarContainer.value?.focus();
}

function handleAppointmentDoubleClick(appointment) {
	editAppointment(appointment);
}

function handleDayDoubleClick(day) {
	console.log('Day double-clicked:', day);
	selectedDate.value = day.date;
	openAppointmentModal(); // Open modal for creating a new event
}

async function handleKeyDown(event) {
	console.log(event);
	console.log(selectedAppointmentId.value);
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
	};
}

const sortedAppointments = (day) => {
	const currentDayStart = day.date; // Use the date property directly
	const currentDayEnd = new Date(day.date);
	currentDayEnd.setHours(23, 59, 59, 999); // Set the end of the day

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

onUnmounted(() => {
	selectedAppointmentId.value = null;
});
</script>

<style>
.calendar-container {
	@apply w-full overflow-hidden !font-body;
	height: calc(100vh - 12rem); /* Adjust based on your layout */

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
	.appointment-selected {
		background-color: rgba(198, 198, 198, 0.32);
	}
}
.calendar-container:focus {
	@apply outline-none ring-1 ring-primary-500;
}
</style>
