<template>
	<div class="p-6 space-y-4">
		<h3 class="text-[14px] tracking-wide uppercase">{{ appointment ? 'Edit' : 'New' }} Appointment</h3>

		<form @submit.prevent="handleSubmit" class="space-y-4">
			<div class="w-full flex flex-row">
				<div class="w-1/2 pr-2">
					<UFormGroup label="Date" required class="w-full">
						<UPopover class="w-full">
							<UInput :model-value="formatDate(form.start_time)" readonly placeholder="Select date" class="w-full" />
							<template #panel>
								<Calendar
									:model-value="calendarValue"
									@update:model-value="handleCalendarSelect"
								/>
							</template>
						</UPopover>
					</UFormGroup>

					<!-- <UFormGroup label="Status">
					<USelect
						v-model="form.status"
						:options="[
							{ value: 'pending', label: 'Pending' },
							{ value: 'confirmed', label: 'Confirmed' },
							{ value: 'cancelled', label: 'Cancelled' },
						]"
						:disabled="isLoading"
					/>
				</UFormGroup> -->
				</div>
				<div class="w-1/2 flex flex-row items-center justify-between">
					<UFormGroup label="Start" required class="w-full pr-2">
						<USelect
							v-model="startTime"
							:options="timeOptions"
							placeholder="Select time"
							@update:model-value="(time) => updateTime('start', time)"
							class="w-full"
						/>
					</UFormGroup>

					<UFormGroup label="End" required class="w-full">
						<USelect
							v-model="endTime"
							:options="endTimeOptions"
							placeholder="Select time"
							@update:model-value="(time) => updateTime('end', time)"
							class="w-full"
						/>
					</UFormGroup>
				</div>
			</div>
			<UFormGroup label="Title" required>
				<UInput v-model="form.title" placeholder="Appointment title" :disabled="isLoading" />
			</UFormGroup>
			<UFormGroup label="Description">
				<FormTiptap v-model="form.description" placeholder="Add description" :disabled="isLoading" rows="3" />
			</UFormGroup>

			<UFormGroup label="Attendees">
				<USelectMenu
					v-model="selectedAttendee"
					:options="availableUsers"
					placeholder="Select users..."
					searchable
					:loading="loadingUsers"
					@update:modelValue="handleAttendeeSelect"
				>
					<template #label>
						<div class="flex items-center gap-2">
							<UIcon name="i-heroicons-user-plus" class="w-4 h-4 text-gray-500" />
							<span class="text-gray-500">{{ selectedAttendee ? selectedAttendee.label : 'Add attendee...' }}</span>
						</div>
					</template>

					<template #option="{ option: user }">
						<div class="flex items-center gap-2 py-1">
							<UAvatar :src="getAvatarUrl(user)" :alt="user.label" size="sm" />
							<div class="flex flex-col">
								<span class="font-medium">{{ user.label }}</span>
								<span class="text-xs text-gray-500">{{ user.email }}</span>
							</div>
						</div>
					</template>
				</USelectMenu>

				<div v-if="form.attendees.length" class="flex flex-wrap flex-row gap-2 mt-2">
					<UBadge
						v-for="attendee in form.attendees"
						:key="attendee.directus_users_id.id"
						:color="isCurrentUserBadge(attendee.directus_users_id.id) ? 'primary' : 'gray'"
						class="flex items-center gap-2"
					>
						<UAvatar
							:src="getAvatarUrl(attendee.directus_users_id)"
							:alt="getUserFullName(attendee.directus_users_id)"
							size="2xs"
						/>
						{{ getUserFullName(attendee.directus_users_id) }}
						<UButton
							color="white"
							variant="ghost"
							icon="i-heroicons-x-mark-20-solid"
							size="2xs"
							class="-mr-1"
							:ui="{ rounded: 'rounded-full' }"
							@click="removeAttendee(attendee.directus_users_id.id)"
						/>
					</UBadge>
				</div>
			</UFormGroup>

			<div class="flex justify-end gap-2 pt-4">
				<UButton color="gray" variant="soft" @click="$emit('cancelled')" :disabled="isLoading">Cancel</UButton>
				<UButton type="submit" color="primary" :loading="isLoading">
					{{ appointment ? 'Update' : 'Create' }}
				</UButton>
			</div>
		</form>
	</div>
</template>

<script setup>
import { format, set, parseISO } from 'date-fns';
import { CalendarDate } from '@internationalized/date';
import { Calendar } from '~/components/ui/calendar';

const props = defineProps({
	appointment: {
		type: Object,
		default: null,
	},
	selectedDate: {
		type: Date,
		required: true,
	},
});

const emit = defineEmits(['saved', 'cancelled']);
const { user } = useEnhancedAuth();
const { createItem, updateItem } = useDirectusItems();
const { filteredUsers, fetchFilteredUsers, loading: loadingUsers } = useFilteredUsers();

const isLoading = ref(false);
const selectedAttendee = ref(null);
const startTime = ref('');
const endTime = ref('');

const form = ref({
	title: '',
	description: '',
	start_time: set(props.selectedDate, { hours: 9, minutes: 0 }),
	end_time: set(props.selectedDate, { hours: 9, minutes: 30 }),
	status: 'pending',
	attendees: [],
});

// Generate time options in 30-minute intervals
const timeOptions = Array.from({ length: 48 }, (_, i) => {
	const hour = Math.floor(i / 2);
	const minute = (i % 2) * 30;
	const time = new Date();
	time.setHours(hour, minute);
	return {
		label: time.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: true,
		}),
		value: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
	};
});

const endTimeOptions = computed(() => {
	if (!startTime.value) return timeOptions;

	const [startHour, startMinute] = startTime.value.split(':').map(Number);
	const startMinutes = startHour * 60 + startMinute;

	return timeOptions.filter((option) => {
		const [hour, minute] = option.value.split(':').map(Number);
		const minutes = hour * 60 + minute;
		return minutes > startMinutes;
	});
});

// Watch for start_time changes and update end_time if needed
watch(
	() => form.value.start_time,
	(newStartTime) => {
		const proposed_end = set(new Date(newStartTime), {
			minutes: newStartTime.getMinutes() + 30,
		});

		if (proposed_end > newStartTime) {
			form.value.end_time = proposed_end;
			endTime.value = format(form.value.end_time, 'HH:mm');
		}
	},
);

const calendarValue = computed(() => {
	const d = form.value.start_time;
	if (!d) return undefined;
	return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
});

function handleCalendarSelect(val) {
	if (!val) return;
	const nativeDate = new Date(val.year, val.month - 1, val.day);
	handleDateSelect({ date: nativeDate });
}

const availableUsers = computed(() => {
	const currentAttendeeIds = form.value.attendees.map((a) => a.directus_users_id.id);
	return filteredUsers.value.filter((user) => !currentAttendeeIds.includes(user.id));
});

const isCurrentUserBadge = (userId) => {
	return user.value && userId === user.value.id;
};

function handleDateSelect(day) {
	// Get current hours and minutes from start_time
	const currentStartHours = form.value.start_time.getHours();
	const currentStartMinutes = form.value.start_time.getMinutes();
	const currentEndHours = form.value.end_time.getHours();
	const currentEndMinutes = form.value.end_time.getMinutes();

	// Update start_time with new date but keep current time
	form.value.start_time = set(day.date, {
		hours: currentStartHours,
		minutes: currentStartMinutes,
		seconds: 0,
		milliseconds: 0,
	});

	// Update end_time with new date but keep current time
	form.value.end_time = set(day.date, {
		hours: currentEndHours,
		minutes: currentEndMinutes,
		seconds: 0,
		milliseconds: 0,
	});
}

function updateTime(type, timeString) {
	if (!timeString) return;

	const [hours, minutes] = timeString.split(':').map(Number);
	const currentDate = type === 'start' ? form.value.start_time : form.value.end_time;

	const newDateTime = set(new Date(currentDate), {
		hours,
		minutes,
		seconds: 0,
		milliseconds: 0,
	});

	if (type === 'start') {
		form.value.start_time = newDateTime;
		startTime.value = timeString;

		// Ensure end time is after start time
		if (form.value.end_time <= newDateTime) {
			const proposed_end = set(new Date(newDateTime), {
				minutes: minutes + 30,
			});
			form.value.end_time = proposed_end;
			endTime.value = format(proposed_end, 'HH:mm');
		}
	} else {
		form.value.end_time = newDateTime;
		endTime.value = timeString;
	}
}

function formatDate(date) {
	if (!date) return '';
	return format(date, 'MMM d, yyyy');
}

function getAvatarUrl(user) {
	if (!user?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
}

function getUserFullName(user) {
	if (!user) return 'Unknown';
	return `${user.first_name} ${user.last_name}`.trim();
}

function handleAttendeeSelect(selectedUser) {
	if (selectedUser) {
		form.value.attendees.push({
			directus_users_id: selectedUser,
		});
		selectedAttendee.value = null;
	}
}

function removeAttendee(userId) {
	form.value.attendees = form.value.attendees.filter((a) => a.directus_users_id.id !== userId);
}

async function handleSubmit() {
	try {
		isLoading.value = true;

		const appointmentData = {
			title: form.value.title,
			description: form.value.description,
			start_time: format(form.value.start_time, "yyyy-MM-dd'T'HH:mm:ss"),
			end_time: format(form.value.end_time, "yyyy-MM-dd'T'HH:mm:ss"),
			status: form.value.status,
		};

		if (props.appointment) {
			await updateItem('appointments', props.appointment.id, appointmentData);
		} else {
			const appointment = await createItem('appointments', appointmentData);

			// Create attendee relationships
			await Promise.all(
				form.value.attendees.map((attendee) =>
					createItem('appointments_directus_users', {
						appointments_id: appointment.id,
						directus_users_id: attendee.directus_users_id.id,
					}),
				),
			);
		}

		emit('saved');
	} catch (error) {
		console.error('Failed to save appointment:', error);
		useToast().add({
			title: 'Error',
			description: 'Failed to save appointment',
			color: 'red',
		});
	} finally {
		isLoading.value = false;
	}
}

onMounted(async () => {
	await fetchFilteredUsers();

	if (props.appointment) {
		form.value = {
			title: props.appointment.title,
			description: props.appointment.description,
			start_time: parseISO(props.appointment.start_time),
			end_time: parseISO(props.appointment.end_time),
			status: props.appointment.status,
			attendees: props.appointment.attendees || [],
		};
		startTime.value = format(form.value.start_time, 'HH:mm');
		endTime.value = format(form.value.end_time, 'HH:mm');
	} else {
		startTime.value = '09:00';
		endTime.value = '09:30';
	}
});
</script>
