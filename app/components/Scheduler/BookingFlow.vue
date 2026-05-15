<!-- components/Scheduler/BookingFlow.vue -->
<!--
  Shared public-booking flow. Used by:
    - /book/<orgSlug>/<userSlug>          → host's default event type
    - /book/<orgSlug>/<userSlug>/<slug>   → specific event type
  Both pages call /api/scheduler/public-booking/<org>/<user>?eventTypeSlug=…
  and pass the resolved data into this component.

  Flow (when an event type is known):
    1. Intake form     (skipped if intake_schema is empty)
    2. Time slot       (date + time grid)
    3. Name + email    (final form, confirm)
    4. Confirmation    (success card)

  Picker mode (?picker=1 OR no default event type): renders a list of all
  event types and routes the visitor into the appropriate flow.
-->
<script setup>
import { format, addDays, startOfDay, setHours, setMinutes, isBefore } from 'date-fns';

const props = defineProps({
	hostUser: { type: Object, required: true },
	hostOrg: { type: Object, required: true },
	settings: { type: Object, required: true },
	availability: { type: Array, default: () => [] },
	existingMeetings: { type: Array, default: () => [] },
	eventTypes: { type: Array, default: () => [] },
	// Active event type. null = show picker.
	eventType: { type: Object, default: null },
});

const toast = useToast();
const router = useRouter();
const route = useRoute();

const eventType = computed(() => props.eventType);
const hasEventType = computed(() => !!eventType.value);

// Stages
//   intake → time → details → done
const intakeFields = computed(() => {
	const schema = eventType.value?.intake_schema;
	return Array.isArray(schema) ? schema : [];
});
const hasIntake = computed(() => intakeFields.value.length > 0);

const stages = computed(() => {
	const out = [];
	if (hasIntake.value) out.push('intake');
	out.push('time', 'details', 'done');
	return out;
});

const stageIndex = ref(0);
const currentStage = computed(() => stages.value[stageIndex.value]);

watch(eventType, () => { stageIndex.value = 0; }, { immediate: false });

// Selection state
const selectedDate = ref(null);
const selectedTime = ref(null);
const intakeAnswers = reactive({});
const submitting = ref(false);
const createdMeeting = ref(null);

const bookingForm = reactive({
	name: '',
	email: '',
	phone: '',
	notes: '',
});

const duration = computed(() => eventType.value?.duration || props.settings?.default_duration || 30);

// Reset intake answers when event type changes
watch(intakeFields, (fields) => {
	for (const k of Object.keys(intakeAnswers)) delete intakeAnswers[k];
	for (const f of fields) {
		intakeAnswers[f.name] = f.type === 'checkbox' ? false : '';
	}
}, { immediate: true });

const availableDates = computed(() => {
	const dates = [];
	const today = startOfDay(new Date());
	for (let i = 1; i <= 30; i++) {
		const date = addDays(today, i);
		const dayName = format(date, 'EEEE');
		const dayAvailability = props.availability.find(
			(a) => a.day_of_week?.toLowerCase() === dayName.toLowerCase(),
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
	const dur = duration.value;
	const bufferBefore = props.settings?.buffer_before || 0;
	const bufferAfter = props.settings?.buffer_after || 0;
	const [startHour, startMin] = (dayAvailability.start_time || '09:00:00').split(':').map(Number);
	const [endHour, endMin] = (dayAvailability.end_time || '17:00:00').split(':').map(Number);
	let currentTime = setMinutes(setHours(selectedDate.value.date, startHour), startMin);
	const endTime = setMinutes(setHours(selectedDate.value.date, endHour), endMin);
	while (isBefore(currentTime, endTime)) {
		const slotEnd = new Date(currentTime.getTime() + dur * 60000);
		const hasConflict = props.existingMeetings.some((meeting) => {
			const meetingStart = new Date(new Date(meeting.scheduled_start || meeting.start_time).getTime() - bufferBefore * 60000);
			const meetingEnd = new Date(new Date(meeting.scheduled_end || meeting.end_time).getTime() + bufferAfter * 60000);
			return (currentTime >= meetingStart && currentTime < meetingEnd) ||
				(slotEnd > meetingStart && slotEnd <= meetingEnd) ||
				(currentTime <= meetingStart && slotEnd >= meetingEnd);
		});
		let isDuringBreak = false;
		if (dayAvailability.break_start && dayAvailability.break_end) {
			const [bsH, bsM] = dayAvailability.break_start.split(':').map(Number);
			const [beH, beM] = dayAvailability.break_end.split(':').map(Number);
			const breakStart = setMinutes(setHours(selectedDate.value.date, bsH), bsM);
			const breakEnd = setMinutes(setHours(selectedDate.value.date, beH), beM);
			isDuringBreak = currentTime >= breakStart && currentTime < breakEnd;
		}
		if (!hasConflict && !isDuringBreak && slotEnd <= endTime) {
			slots.push({ time: currentTime, formatted: format(currentTime, 'h:mm a') });
		}
		currentTime = new Date(currentTime.getTime() + 30 * 60000);
	}
	return slots;
});

function selectEventType(et) {
	// Navigate to the 3-segment URL so the URL is shareable.
	const orgSlug = route.params.orgSlug;
	const userSlug = route.params.userSlug;
	router.push(`/book/${orgSlug}/${userSlug}/${et.slug}`);
}

const selectDate = (dateObj) => { selectedDate.value = dateObj; selectedTime.value = null; };
const selectTime = (slot) => {
	selectedTime.value = slot;
	advanceStage();
};

function advanceStage() {
	if (stageIndex.value < stages.value.length - 1) stageIndex.value++;
}
function goBack() {
	if (stageIndex.value > 0) stageIndex.value--;
}

const intakeValid = computed(() => {
	for (const f of intakeFields.value) {
		if (!f.required) continue;
		const v = intakeAnswers[f.name];
		if (f.type === 'checkbox') {
			if (!v) return false;
		} else {
			if (!v || (typeof v === 'string' && !v.trim())) return false;
		}
	}
	return true;
});

function submitIntake() {
	if (!intakeValid.value) {
		toast.add({ title: 'Please fill in all required fields', color: 'red' });
		return;
	}
	advanceStage();
}

const formatIntakeForDescription = () => {
	if (!hasIntake.value) return '';
	const lines = intakeFields.value
		.map((f) => {
			const v = intakeAnswers[f.name];
			if (v === undefined || v === null || v === '') return null;
			return `${f.label}: ${f.type === 'checkbox' ? (v ? 'Yes' : 'No') : v}`;
		})
		.filter(Boolean);
	return lines.length > 0 ? `\n\n---\nIntake:\n${lines.join('\n')}` : '';
};

// Stage 5: paid event types route through Stripe Checkout. The submit button
// label below switches to "Continue to payment" when this is truthy.
const isPaid = computed(() => (eventType.value?.price_cents ?? 0) > 0);
const priceLabel = computed(() => {
	const c = eventType.value?.price_cents ?? 0;
	if (!c) return null;
	const dollars = c / 100;
	return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
});

async function submitBooking() {
	if (!bookingForm.name || !bookingForm.email) {
		toast.add({ title: 'Please fill in required fields', color: 'red' });
		return;
	}
	submitting.value = true;
	try {
		const startTime = selectedTime.value.time;
		const endTime = new Date(startTime.getTime() + duration.value * 60000);
		const intakeBlock = formatIntakeForDescription();

		if (isPaid.value && eventType.value?.id) {
			// Build the URL we'll come back to. The success URL adds session_id +
			// keeps the eventTypeSlug intact so we can resolve the merchant org.
			const here = new URL(window.location.href);
			here.search = '';
			const successUrl = `${here.toString()}?session_id={CHECKOUT_SESSION_ID}`;
			const cancelUrl = `${here.toString()}?canceled=1`;

			const checkout = await $fetch('/api/scheduler/booking-checkout', {
				method: 'POST',
				body: {
					hostUserId: props.hostUser.id,
					eventTypeId: eventType.value.id,
					scheduledStart: startTime.toISOString(),
					scheduledEnd: endTime.toISOString(),
					durationMinutes: duration.value,
					inviteeName: bookingForm.name,
					inviteeEmail: bookingForm.email,
					inviteePhone: bookingForm.phone || undefined,
					bookingNotes: (bookingForm.notes || '') + intakeBlock,
					intakeResponses: hasIntake.value ? { ...intakeAnswers } : null,
					successUrl,
					cancelUrl,
				},
			});
			window.location.href = checkout.url;
			return;
		}

		const response = await $fetch('/api/scheduler/book', {
			method: 'POST',
			body: {
				hostUserId: props.hostUser.id,
				eventTypeId: eventType.value?.id || null,
				title: `${eventType.value?.title || 'Meeting'} with ${bookingForm.name}`,
				meetingType: eventType.value?.slug || 'general',
				scheduledStart: startTime.toISOString(),
				scheduledEnd: endTime.toISOString(),
				durationMinutes: duration.value,
				inviteeName: bookingForm.name,
				inviteeEmail: bookingForm.email,
				inviteePhone: bookingForm.phone || undefined,
				bookingNotes: (bookingForm.notes || '') + intakeBlock,
				intakeResponses: hasIntake.value ? { ...intakeAnswers } : null,
			},
		});
		createdMeeting.value = response.meeting;
		advanceStage();
		toast.add({ title: 'Meeting booked!', color: 'green' });
	} catch (error) {
		toast.add({ title: 'Error booking meeting', description: error.message, color: 'red' });
	}
	submitting.value = false;
}

// Embed mode: when this booking page is loaded inside an iframe via /embed.js,
// the URL carries ?embed=1. We use it to (a) tell the parent we're done so it
// can close the modal, and (b) tighten layout (deferred — host page wraps it).
const isEmbedded = computed(() => route.query.embed === '1');

function notifyEmbedHost(type) {
	if (!import.meta.client) return;
	if (window.parent === window) return;
	try {
		window.parent.postMessage({ type, source: 'earnest' }, '*');
	} catch (_) { /* parent unreachable; ignore */ }
}

// When booking lands in `done`, emit so the embed modal can auto-close after
// a beat (gives the user time to see the confirmation card).
watch(currentStage, (s) => {
	if (s === 'done' && isEmbedded.value) {
		setTimeout(() => notifyEmbedHost('earnest:booking:done'), 4000);
	}
});

// Stripe-return path: if we land here with ?session_id=… or ?canceled=1, react.
const finalizingPayment = ref(false);
const paymentError = ref('');

async function handleStripeReturn() {
	if (route.query.canceled === '1') {
		toast.add({ title: 'Payment canceled', description: 'Your meeting was not booked. Try again when you\'re ready.', color: 'amber' });
		const next = { ...route.query };
		delete next.canceled;
		router.replace({ query: next });
		return;
	}

	const sessionId = typeof route.query.session_id === 'string' ? route.query.session_id : null;
	if (!sessionId || !eventType.value?.id) return;

	finalizingPayment.value = true;
	paymentError.value = '';
	try {
		const response = await $fetch('/api/scheduler/checkout-success', {
			method: 'POST',
			body: { sessionId, eventTypeId: eventType.value.id },
		});
		createdMeeting.value = response.meeting;
		stageIndex.value = stages.value.length - 1; // jump to "done"
		const next = { ...route.query };
		delete next.session_id;
		router.replace({ query: next });
		toast.add({ title: 'Payment received — meeting booked!', color: 'green' });
	} catch (error) {
		paymentError.value = error?.data?.message || error?.message || 'Failed to confirm booking.';
		toast.add({ title: 'Couldn\'t confirm booking', description: paymentError.value, color: 'red' });
	}
	finalizingPayment.value = false;
}

onMounted(() => {
	handleStripeReturn();
});
</script>

<template>
	<div>
		<!-- Stage 5: confirming a Stripe Checkout return. -->
		<div v-if="finalizingPayment" class="ios-card p-8 text-center mb-6">
			<UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-primary mx-auto mb-3 animate-spin" />
			<h2 class="text-base font-semibold mb-1">Confirming your payment…</h2>
			<p class="text-xs text-muted-foreground">Don't close this page.</p>
		</div>
		<div v-if="paymentError && !finalizingPayment" class="ios-card p-5 mb-6 border-destructive/50">
			<div class="flex items-start gap-3">
				<UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-destructive shrink-0 mt-0.5" />
				<div class="min-w-0 flex-1">
					<h2 class="text-sm font-semibold mb-1">Couldn't confirm your booking</h2>
					<p class="text-xs text-muted-foreground">{{ paymentError }}</p>
					<p class="text-xs text-muted-foreground mt-2">
						If you were charged, contact the host with your receipt and they can confirm your meeting manually.
					</p>
				</div>
			</div>
		</div>

		<!-- Picker view: no event type selected, or explicit ?picker=1 -->
		<div v-if="!hasEventType">
			<div v-if="eventTypes.length === 0" class="ios-card p-8 text-center">
				<UIcon name="i-heroicons-calendar" class="w-10 h-10 text-muted-foreground mx-auto mb-3" />
				<h2 class="text-base font-semibold mb-1">No bookable event types</h2>
				<p class="text-sm text-muted-foreground">This host hasn't published any event types yet.</p>
			</div>
			<div v-else>
				<h2 class="text-lg font-semibold mb-4">Choose a meeting type</h2>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
					<button
						v-for="et in eventTypes"
						:key="et.id"
						class="ios-card p-4 text-left hover:border-primary transition"
						@click="selectEventType(et)"
					>
						<div class="flex items-center justify-between mb-1">
							<div class="flex items-center gap-2 min-w-0">
								<span
									class="w-2.5 h-2.5 rounded-full shrink-0"
									:style="{ background: et.color || 'var(--primary)' }"
								/>
								<span class="font-medium truncate">{{ et.title }}</span>
							</div>
							<div class="flex items-center gap-2 shrink-0">
								<span
									v-if="(et.price_cents ?? 0) > 0"
									class="text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
								>${{ (et.price_cents / 100).toFixed(et.price_cents % 100 === 0 ? 0 : 2) }}</span>
								<span class="text-sm text-muted-foreground">{{ et.duration }} min</span>
							</div>
						</div>
						<p v-if="et.description" class="text-sm text-muted-foreground">{{ et.description }}</p>
					</button>
				</div>
			</div>
		</div>

		<!-- Booking flow -->
		<template v-else>
			<!-- Header for the active event type -->
			<div class="ios-card p-4 mb-6 flex items-center gap-3">
				<span
					class="w-3 h-3 rounded-full shrink-0"
					:style="{ background: eventType.color || 'var(--primary)' }"
				/>
				<div class="min-w-0 flex-1">
					<div class="font-medium truncate flex items-center gap-2 flex-wrap">
						<span>{{ eventType.title }}</span>
						<span class="text-muted-foreground font-normal">· {{ duration }} min</span>
						<span
							v-if="priceLabel"
							class="text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
						>{{ priceLabel }}</span>
					</div>
					<p v-if="eventType.description" class="text-xs text-muted-foreground truncate">{{ eventType.description }}</p>
				</div>
				<NuxtLink
					v-if="eventTypes.length > 1 && currentStage !== 'done'"
					:to="`/book/${route.params.orgSlug}/${route.params.userSlug}?picker=1`"
					class="text-xs text-muted-foreground underline shrink-0"
				>
					Change
				</NuxtLink>
			</div>

			<!-- Intake step -->
			<div v-if="currentStage === 'intake'" class="ios-card p-5 space-y-4">
				<h2 class="text-base font-semibold">Tell us a bit</h2>
				<div v-for="field in intakeFields" :key="field.name" class="space-y-1.5">
					<label class="text-xs font-medium text-foreground">
						{{ field.label }}
						<span v-if="field.required" class="text-destructive">*</span>
					</label>
					<UInput v-if="field.type === 'text'" v-model="intakeAnswers[field.name]" />
					<UTextarea v-else-if="field.type === 'textarea'" v-model="intakeAnswers[field.name]" :rows="3" />
					<select
						v-else-if="field.type === 'select'"
						v-model="intakeAnswers[field.name]"
						class="w-full rounded-full border bg-background px-3 py-2 text-sm"
					>
						<option value="">—</option>
						<option v-for="opt in (field.options || [])" :key="opt" :value="opt">{{ opt }}</option>
					</select>
					<label v-else-if="field.type === 'checkbox'" class="flex items-center gap-2 text-sm">
						<input type="checkbox" v-model="intakeAnswers[field.name]" />
						<span>{{ field.label }}</span>
					</label>
				</div>
				<div class="flex justify-end pt-2">
					<UButton color="primary" size="lg" :disabled="!intakeValid" @click="submitIntake">
						Continue
					</UButton>
				</div>
			</div>

			<!-- Time step -->
			<div v-else-if="currentStage === 'time'">
				<button
					v-if="hasIntake"
					class="flex items-center gap-1 text-muted-foreground hover:text-foreground mb-3"
					@click="goBack"
				>
					<UIcon name="i-heroicons-arrow-left" class="w-4 h-4" /> Back
				</button>

				<div class="mb-6">
					<h2 class="text-base font-semibold mb-3">Select a date</h2>
					<div class="flex flex-wrap gap-2">
						<button
							v-for="dateObj in availableDates"
							:key="dateObj.formatted"
							:class="['px-4 py-2 rounded-lg border text-sm transition', selectedDate?.formatted === dateObj.formatted ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40']"
							@click="selectDate(dateObj)"
						>
							{{ dateObj.formatted }}
						</button>
					</div>
					<p v-if="availableDates.length === 0" class="text-sm text-muted-foreground mt-2">No available dates</p>
				</div>

				<div v-if="selectedDate">
					<h2 class="text-base font-semibold mb-3">Select a time</h2>
					<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
						<button
							v-for="slot in availableTimeSlots"
							:key="slot.formatted"
							class="px-3 py-2 rounded-lg border text-sm transition border-border hover:border-primary/60"
							@click="selectTime(slot)"
						>
							{{ slot.formatted }}
						</button>
					</div>
					<p v-if="availableTimeSlots.length === 0" class="text-sm text-muted-foreground mt-2">No available times</p>
				</div>
			</div>

			<!-- Details step -->
			<div v-else-if="currentStage === 'details'">
				<button class="flex items-center gap-1 text-muted-foreground hover:text-foreground mb-3" @click="goBack">
					<UIcon name="i-heroicons-arrow-left" class="w-4 h-4" /> Back
				</button>

				<div class="ios-card p-4 mb-6">
					<div class="flex items-center gap-3">
						<UIcon name="i-heroicons-calendar" class="w-5 h-5 text-primary" />
						<div>
							<div class="font-medium text-sm">{{ selectedDate?.formatted }}</div>
							<div class="text-xs text-muted-foreground">{{ selectedTime?.formatted }} · {{ duration }} minutes</div>
						</div>
					</div>
				</div>

				<form class="space-y-4" @submit.prevent="submitBooking">
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
						<UTextarea v-model="bookingForm.notes" placeholder="Anything you'd like us to know?" :rows="3" />
					</UFormGroup>
					<UButton type="submit" color="primary" size="lg" block :loading="submitting">
						{{ isPaid ? `Continue to payment · ${priceLabel}` : 'Confirm Booking' }}
					</UButton>
					<p v-if="isPaid" class="text-[11px] text-muted-foreground text-center">
						You'll be redirected to Stripe to complete payment. Your meeting is confirmed once payment succeeds.
					</p>
				</form>
			</div>

			<!-- Confirmation -->
			<div v-else-if="currentStage === 'done'" class="text-center py-8">
				<div class="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
					<UIcon name="i-heroicons-check" class="w-8 h-8 text-green-500" />
				</div>
				<h2 class="text-2xl font-semibold mb-2">Meeting Confirmed!</h2>
				<p class="text-muted-foreground mb-6">You'll receive a confirmation email with the meeting details.</p>

				<div class="ios-card p-6 text-left max-w-md mx-auto">
					<h3 class="font-semibold mb-3">Meeting Details</h3>
					<div class="space-y-2 text-sm">
						<div class="flex justify-between"><span class="text-muted-foreground">Type:</span><span>{{ eventType?.title }}</span></div>
						<div class="flex justify-between"><span class="text-muted-foreground">Date:</span><span>{{ selectedDate?.formatted }}</span></div>
						<div class="flex justify-between"><span class="text-muted-foreground">Time:</span><span>{{ selectedTime?.formatted }}</span></div>
						<div class="flex justify-between"><span class="text-muted-foreground">Duration:</span><span>{{ duration }} minutes</span></div>
						<div class="flex justify-between"><span class="text-muted-foreground">With:</span><span>{{ hostUser?.first_name }} {{ hostUser?.last_name }}</span></div>
					</div>
				</div>

				<p class="text-xs text-muted-foreground mt-6">Check your email for the meeting link and calendar invite.</p>
			</div>
		</template>
	</div>
</template>
