<template>
	<div class="space-y-4">
		<h3 class="text-lg font-medium">{{ appointment ? 'Edit' : 'New' }} Appointment</h3>

		<form @submit.prevent="handleSubmit" class="space-y-4">
			<UFormGroup label="Title" required>
				<UInput v-model="form.title" placeholder="Appointment title" :disabled="isLoading" />
			</UFormGroup>

			<div class="grid grid-cols-2 gap-4">
				<UFormGroup label="Date" required>
					<UPopover>
						<UInput
							:model-value="formatDate(form.start_time)"
							readonly
							placeholder="Select date"
							icon="i-heroicons-calendar"
						/>
						<template #panel>
							<VCalendar
								:model-value="form.start_time"
								@input="(date) => updateDateTime('start', date)"
								:attributes="calendarAttrs"
								is-expanded
							/>
						</template>
					</UPopover>
				</UFormGroup>

				<UFormGroup label="Status">
					<USelect
						v-model="form.status"
						:options="[
							{ value: 'pending', label: 'Pending' },
							{ value: 'confirmed', label: 'Confirmed' },
							{ value: 'cancelled', label: 'Cancelled' },
						]"
						:disabled="isLoading"
					/>
				</UFormGroup>

				<UFormGroup label="Start Time" required>
					<USelect
						v-model="startTime"
						:options="timeOptions"
						placeholder="Select time"
						@update:model-value="(time) => updateDateTime('start', form.start_time, time)"
					/>
				</UFormGroup>

				<UFormGroup label="End Time" required>
					<USelect
						v-model="endTime"
						:options="timeOptions"
						placeholder="Select time"
						@update:model-value="(time) => updateDateTime('end', form.end_time, time)"
					/>
				</UFormGroup>
			</div>

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
import { ref, computed, onMounted } from 'vue';
import { format, parse, parseISO, set } from 'date-fns';

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
const { user } = useDirectusAuth();
const { createItem, updateItem } = useDirectusItems();
const { filteredUsers, fetchFilteredUsers, loading: loadingUsers } = useFilteredUsers();

const isLoading = ref(false);
const selectedAttendee = ref(null);
const startTime = ref('');
const endTime = ref('');

const form = ref({
	title: '',
	description: '',
	start_time: props.selectedDate,
	end_time: props.selectedDate,
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

const calendarAttrs = computed(() => [
	{
		highlight: true,
		dates: form.value.start_time,
	},
]);

const availableUsers = computed(() => {
	const currentAttendeeIds = form.value.attendees.map((a) => a.directus_users_id.id);
	return filteredUsers.value.filter((user) => !currentAttendeeIds.includes(user.id));
});

const isCurrentUserBadge = (userId) => {
	return user.value && userId === user.value.id;
};

function updateDateTime(type, date, time) {
	if (date) {
		const dateObj = new Date(date);
		if (type === 'start') {
			form.value.start_time = dateObj;
			if (time) {
				const [hours, minutes] = time.split(':');
				form.value.start_time = set(dateObj, { hours: parseInt(hours), minutes: parseInt(minutes) });
			}
		} else {
			form.value.end_time = dateObj;
			if (time) {
				const [hours, minutes] = time.split(':');
				form.value.end_time = set(dateObj, { hours: parseInt(hours), minutes: parseInt(minutes) });
			}
		}
	}
}

function formatDate(date) {
	if (!date) return '';
	return format(new Date(date), 'PPP');
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
			start_time: form.value.start_time.toISOString(),
			end_time: form.value.end_time.toISOString(),
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

const fetchUsers = async () => {
	try {
		const users = await readUsers({
			fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
			filter: {
				id: {
					_neq: user.value?.id,
				},
			},
		});

		userOptions.value = users.map((user) => ({
			id: user.id,
			label: `${user.first_name} ${user.last_name}`,
			email: user.email,
			avatar: user.avatar,
			first_name: user.first_name,
			last_name: user.last_name,
		}));
	} catch (error) {
		console.error('Error fetching users:', error);
		useToast().add({
			title: 'Error',
			description: 'Failed to load users',
			color: 'red',
		});
	}
};

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

		startTime.value = format(parseISO(props.appointment.start_time), 'HH:mm');
		endTime.value = format(parseISO(props.appointment.end_time), 'HH:mm');
	}
});
</script>
