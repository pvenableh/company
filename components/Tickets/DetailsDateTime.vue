<template>
	<div class="grid grid-cols-2 gap-4">
		<UFormGroup label="Due Date">
			<UPopover>
				<UInput
					:model-value="formattedDate"
					:readonly="true"
					:placeholder="formatDisplayDate(new Date())"
					icon="i-heroicons-calendar"
					class="w-full"
				/>
				<template #panel>
					<VCalendar :attributes="calendarAttrs" is-expanded v-model="localDate" @dayclick="updateDueDate" />
				</template>
			</UPopover>
		</UFormGroup>

		<UFormGroup label="Due Time">
			<USelect
				v-model="localTime"
				:options="timeOptions"
				placeholder="Select time"
				@update:model-value="updateDateTime"
			/>
		</UFormGroup>
	</div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
	modelValue: {
		type: String,
		default: null,
	},
	disabled: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['update:modelValue']);

// Create local state for date and time
const localDate = ref(props.modelValue ? new Date(props.modelValue) : new Date());
const localTime = ref(props.modelValue ? props.modelValue.slice(11, 16) : '17:00');

// Calendar attributes
const calendarAttrs = [
	{
		key: 'today',
		dot: true,
		dates: new Date(),
	},
];

// Generate time options in 30-minute increments
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

// Format the date for display
const formatDisplayDate = (date) => {
	if (!date) return '';
	// Create date in local timezone
	const localDate = new Date(date);
	return localDate.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	});
};

// Computed property for formatted date
const formattedDate = computed(() => {
	return formatDisplayDate(localDate.value);
});

// Handle date update from calendar
const updateDueDate = (day) => {
	localDate.value = day.date;
	updateDateTime();
};

// Update date and time together
const updateDateTime = () => {
	if (localDate.value && localTime.value) {
		// Get the user's timezone
		const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

		// Parse hours and minutes
		const [hours, minutes] = localTime.value.split(':');

		// Create date in local timezone
		const dateTime = new Date(localDate.value);

		// Set hours and minutes in local timezone
		dateTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

		// Convert to ISO string while preserving timezone offset
		const offset = dateTime.getTimezoneOffset();
		const localISOTime = new Date(dateTime.getTime() - offset * 60 * 1000).toISOString();

		// Emit the updated value
		emit('update:modelValue', localISOTime);
	}
};

// Watch for changes in the modelValue prop
watch(
	() => props.modelValue,
	(newValue) => {
		if (newValue) {
			localDate.value = new Date(newValue);
			localTime.value = newValue.slice(11, 16);
		}
	},
	{ immediate: true },
);
</script>
