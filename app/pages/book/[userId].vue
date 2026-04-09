<!-- pages/book/[userId].vue -->
<script setup>
import { format, addDays, startOfDay, setHours, setMinutes, isBefore } from 'date-fns';

definePageMeta({
	layout: 'blank',
	auth: false,
});
useHead({ title: 'Book Appointment | Earnest' });

const route = useRoute();
const toast = useToast();
const config = useRuntimeConfig();

const userId = computed(() => route.params.userId);

// State
const loading = ref(true);
const submitting = ref(false);
const step = ref(1); // 1: Select time, 2: Enter details, 3: Confirmation

// Data
const hostUser = ref(null);
const settings = ref(null);
const availability = ref([]);
const existingMeetings = ref([]);

const selectedDate = ref(null);
const selectedTime = ref(null);
const selectedDuration = ref(30);
const createdMeeting = ref(null);

// Form
const bookingForm = reactive({
	name: '',
	email: '',
	phone: '',
	notes: '',
	meetingType: 'consultation',
});

// Meeting Types
const meetingTypes = [
	{ label: 'Consultation', value: 'consultation', duration: 30, description: 'Quick chat to discuss your needs' },
	{ label: 'Discovery Call', value: 'discovery', duration: 45, description: 'In-depth discussion about your project' },
	{ label: 'Project Review', value: 'project_review', duration: 60, description: 'Review ongoing work and progress' },
	{ label: 'Presentation', value: 'presentation', duration: 60, description: 'Formal presentation or demo' },
];

// Computed
const availableDates = computed(() => {
	const dates = [];
	const today = startOfDay(new Date());
	
	for (let i = 1; i <= 30; i++) {
		const date = addDays(today, i);
		const dayName = format(date, 'EEEE');
		
		const dayAvailability = availability.value.find(
			(a) => a.day_of_week?.toLowerCase() === dayName.toLowerCase()
		);
		
		if (dayAvailability && dayAvailability.is_available !== false) {
			dates.push({
				date,
				formatted: format(date, 'EEE, MMM d'),
				dayName,
				availability: dayAvailability,
			});
		}
	}
	
	return dates;
});

const availableTimeSlots = computed(() => {
	if (!selectedDate.value) return [];
	
	const dayAvailability = selectedDate.value.availability;
	if (!dayAvailability) return [];
	
	const slots = [];
	const duration = selectedDuration.value;
	const bufferBefore = settings.value?.buffer_before || 0;
	const bufferAfter = settings.value?.buffer_after || 0;
	
	const [startHour, startMin] = (dayAvailability.start_time || '09:00:00').split(':').map(Number);
	const [endHour, endMin] = (dayAvailability.end_time || '17:00:00').split(':').map(Number);
	
	let currentTime = setMinutes(setHours(selectedDate.value.date, startHour), startMin);
	const endTime = setMinutes(setHours(selectedDate.value.date, endHour), endMin);
	
	while (isBefore(currentTime, endTime)) {
		const slotEnd = new Date(currentTime.getTime() + duration * 60000);
		
		// Check conflicts with existing meetings
		const hasConflict = existingMeetings.value.some((meeting) => {
			const meetingStart = new Date(new Date(meeting.scheduled_start || meeting.start_time).getTime() - bufferBefore * 60000);
			const meetingEnd = new Date(new Date(meeting.scheduled_end || meeting.end_time).getTime() + bufferAfter * 60000);
			return (currentTime >= meetingStart && currentTime < meetingEnd) ||
				(slotEnd > meetingStart && slotEnd <= meetingEnd) ||
				(currentTime <= meetingStart && slotEnd >= meetingEnd);
		});
		
		// Check break time
		let isDuringBreak = false;
		if (dayAvailability.break_start && dayAvailability.break_end) {
			const [bsH, bsM] = dayAvailability.break_start.split(':').map(Number);
			const [beH, beM] = dayAvailability.break_end.split(':').map(Number);
			const breakStart = setMinutes(setHours(selectedDate.value.date, bsH), bsM);
			const breakEnd = setMinutes(setHours(selectedDate.value.date, beH), beM);
			isDuringBreak = currentTime >= breakStart && currentTime < breakEnd;
		}
		
		if (!hasConflict && !isDuringBreak && slotEnd <= endTime) {
			slots.push({
				time: currentTime,
				formatted: format(currentTime, 'h:mm a'),
			});
		}
		
		currentTime = new Date(currentTime.getTime() + 30 * 60000);
	}
	
	return slots;
});

const selectedMeetingType = computed(() => meetingTypes.find((t) => t.value === bookingForm.meetingType));

// Methods
const fetchBookingData = async () => {
	loading.value = true;
	try {
		const response = await $fetch(`/api/scheduler/public-booking/${userId.value}`);
		hostUser.value = response.user;
		settings.value = response.settings;
		availability.value = response.availability || [];
		existingMeetings.value = response.meetings || [];
		
		if (settings.value?.default_duration) {
			selectedDuration.value = settings.value.default_duration;
		}
	} catch (error) {
		toast.add({ title: 'Error loading booking page', color: 'red' });
	}
	loading.value = false;
};

const selectDate = (dateObj) => {
	selectedDate.value = dateObj;
	selectedTime.value = null;
};

const selectTime = (slot) => {
	selectedTime.value = slot;
	step.value = 2;
};

const selectMeetingType = (type) => {
	bookingForm.meetingType = type.value;
	selectedDuration.value = type.duration;
};

const goBack = () => step.value > 1 && step.value--;

const submitBooking = async () => {
	if (!bookingForm.name || !bookingForm.email) {
		toast.add({ title: 'Please fill in required fields', color: 'red' });
		return;
	}
	
	submitting.value = true;
	try {
		const startTime = selectedTime.value.time;
		const endTime = new Date(startTime.getTime() + selectedDuration.value * 60000);
		
		const response = await $fetch('/api/scheduler/book', {
			method: 'POST',
			body: {
				hostUserId: userId.value,
				title: `${selectedMeetingType.value?.label || 'Meeting'} with ${bookingForm.name}`,
				meetingType: bookingForm.meetingType,
				scheduledStart: startTime.toISOString(),
				scheduledEnd: endTime.toISOString(),
				durationMinutes: selectedDuration.value,
				inviteeName: bookingForm.name,
				inviteeEmail: bookingForm.email,
				inviteePhone: bookingForm.phone || undefined,
				bookingNotes: bookingForm.notes || undefined,
			},
		});
		
		createdMeeting.value = response.meeting;
		step.value = 3;
		toast.add({ title: 'Meeting booked!', color: 'green' });
	} catch (error) {
		toast.add({ title: 'Error booking meeting', description: error.message, color: 'red' });
	}
	submitting.value = false;
};

onMounted(() => fetchBookingData());
</script>

<template>
	<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
		<!-- Header -->
		<div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
			<div class="max-w-3xl mx-auto px-4 py-6">
				<div v-if="hostUser" class="flex items-center gap-4">
					<UAvatar :alt="hostUser.first_name" size="lg" />
					<div>
						<h1 class="text-xl font-semibold">{{ hostUser.first_name }} {{ hostUser.last_name }}</h1>
						<p class="text-gray-500">{{ settings?.booking_page_title || 'Schedule a meeting' }}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="max-w-3xl mx-auto px-4 py-12 text-center">
			<UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
			<p class="text-gray-500">Loading...</p>
		</div>

		<!-- Booking Flow -->
		<div v-else class="max-w-3xl mx-auto px-4 py-8">
			<!-- Progress -->
			<div class="flex items-center justify-center gap-4 mb-8">
				<div v-for="s in 3" :key="s" class="flex items-center gap-2">
					<div :class="['w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium', step >= s ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500']">
						{{ s }}
					</div>
					<span v-if="s < 3" class="w-12 h-0.5 bg-gray-200 dark:bg-gray-700" />
				</div>
			</div>

			<!-- Step 1: Select Date & Time -->
			<div v-if="step === 1">
				<div class="mb-8">
					<h2 class="text-lg font-semibold mb-4">Select Meeting Type</h2>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<div
							v-for="type in meetingTypes"
							:key="type.value"
							:class="['p-4 border-2 rounded-lg cursor-pointer transition', bookingForm.meetingType === type.value ? 'border-primary bg-primary/10' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300']"
							@click="selectMeetingType(type)"
						>
							<div class="flex items-center justify-between mb-1">
								<span class="font-medium">{{ type.label }}</span>
								<span class="text-sm text-gray-500">{{ type.duration }} min</span>
							</div>
							<p class="text-sm text-gray-500">{{ type.description }}</p>
						</div>
					</div>
				</div>

				<div class="mb-8">
					<h2 class="text-lg font-semibold mb-4">Select a Date</h2>
					<div class="flex flex-wrap gap-2">
						<button
							v-for="dateObj in availableDates"
							:key="dateObj.formatted"
							:class="['px-4 py-2 rounded-lg border transition text-sm', selectedDate?.formatted === dateObj.formatted ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300']"
							@click="selectDate(dateObj)"
						>
							{{ dateObj.formatted }}
						</button>
					</div>
					<p v-if="availableDates.length === 0" class="text-gray-500 text-sm mt-2">No available dates</p>
				</div>

				<div v-if="selectedDate">
					<h2 class="text-lg font-semibold mb-4">Select a Time</h2>
					<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
						<button
							v-for="slot in availableTimeSlots"
							:key="slot.formatted"
							:class="['px-3 py-2 rounded-lg border transition text-sm', selectedTime?.formatted === slot.formatted ? 'border-primary bg-primary text-white' : 'border-gray-200 dark:border-gray-700 hover:border-primary/60']"
							@click="selectTime(slot)"
						>
							{{ slot.formatted }}
						</button>
					</div>
					<p v-if="availableTimeSlots.length === 0" class="text-gray-500 text-sm mt-2">No available times</p>
				</div>
			</div>

			<!-- Step 2: Enter Details -->
			<div v-else-if="step === 2">
				<button class="flex items-center gap-1 text-gray-500 hover:text-gray-700 mb-6" @click="goBack">
					<UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
					Back
				</button>

				<div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-6">
					<div class="flex items-center gap-3">
						<UIcon name="i-heroicons-calendar" class="w-5 h-5 text-primary" />
						<div>
							<div class="font-medium">{{ selectedDate?.formatted }}</div>
							<div class="text-sm text-gray-500">{{ selectedTime?.formatted }} · {{ selectedDuration }} minutes</div>
						</div>
					</div>
				</div>

				<h2 class="text-lg font-semibold mb-4">Your Details</h2>

				<form @submit.prevent="submitBooking" class="space-y-4">
					<UFormGroup label="Name" required>
						<UInput v-model="bookingForm.name" placeholder="Your full name" size="lg" />
					</UFormGroup>
					<UFormGroup label="Email" required>
						<UInput v-model="bookingForm.email" type="email" placeholder="your@email.com" size="lg" />
					</UFormGroup>
					<UFormGroup label="Phone (optional)">
						<UInput v-model="bookingForm.phone" type="tel" placeholder="+1 (555) 000-0000" size="lg" />
					</UFormGroup>
					<UFormGroup label="Notes (optional)">
						<UTextarea v-model="bookingForm.notes" placeholder="Anything you'd like us to know?" rows="3" />
					</UFormGroup>
					<UButton type="submit" color="primary" size="lg" block :loading="submitting">
						Confirm Booking
					</UButton>
				</form>
			</div>

			<!-- Step 3: Confirmation -->
			<div v-else-if="step === 3" class="text-center py-8">
				<div class="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
					<UIcon name="i-heroicons-check" class="w-8 h-8 text-green-500" />
				</div>
				<h2 class="text-2xl font-semibold mb-2">Meeting Confirmed!</h2>
				<p class="text-gray-500 mb-6">You'll receive a confirmation email with the meeting details.</p>

				<div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-6 text-left max-w-md mx-auto">
					<h3 class="font-semibold mb-3">Meeting Details</h3>
					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-gray-500">Type:</span>
							<span>{{ selectedMeetingType?.label }}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-500">Date:</span>
							<span>{{ selectedDate?.formatted }}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-500">Time:</span>
							<span>{{ selectedTime?.formatted }}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-500">Duration:</span>
							<span>{{ selectedDuration }} minutes</span>
						</div>
						<div class="flex justify-between">
							<span class="text-gray-500">With:</span>
							<span>{{ hostUser?.first_name }} {{ hostUser?.last_name }}</span>
						</div>
					</div>
				</div>

				<p class="text-sm text-gray-500 mt-6">Check your email for the meeting link and calendar invite.</p>
			</div>
		</div>

		<div class="text-center py-8 text-sm text-gray-400">Powered by Hue Creative Agency</div>
	</div>
</template>
