<!-- PaymentEvents.vue -->
<script setup>
const props = defineProps({
	paymentIntentId: {
		type: String,
		required: true,
	},
});

const events = ref([]);
const loading = ref(true);
const error = ref(null);
const paymentIntent = ref(null);

// Uses formatDateWithTime from utils/dates.ts (timestamp is unix seconds)
const formatDate = (timestamp) => formatDateWithTime(timestamp);

const { getStatusBadgeClasses: statusColorClass } = useStatusStyle();

const fetchEvents = async () => {
	if (!props.paymentIntentId) return;

	loading.value = true;
	error.value = null;

	try {
		const response = await $fetch(`/api/stripe/events/${props.paymentIntentId}`);
		console.log('API Response:', response); // Debug log

		if (response.error) {
			error.value = response.error;
			return;
		}

		// Access the data directly from the response
		events.value = response.data.events;
		paymentIntent.value = response.data.paymentIntent;
	} catch (err) {
		error.value = err.message;
		console.error('Error fetching payment events:', err);
	} finally {
		loading.value = false;
	}
};

watch(() => props.paymentIntentId, fetchEvents, { immediate: true });
</script>

<template>
	<div class="w-full">
		<h3 class="payment-item__subtitle">Payment Timeline:</h3>

		<!-- <div v-if="paymentIntent">
			<p>Payment Intent ID: {{ paymentIntent.id }}</p>
			<p>Status: {{ paymentIntent.status }}</p>
		</div> -->

		<div v-if="loading" class="space-y-3">
			<div v-for="n in 3" :key="n" class="animate-pulse">
				<div class="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg"></div>
			</div>
		</div>

		<UAlert v-else-if="error" :title="error" color="red" variant="soft" icon="i-heroicons-exclamation-triangle" />

		<div v-else-if="events.length" class="space-y-3">
			<div
				v-for="event in events"
				:key="event.id"
				class="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
			>
				<div class="flex items-start justify-between gap-4">
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-gray-900 dark:text-gray-100 uppercase">
							{{ event.type.replace('payment_intent.', '').replace(/_/g, ' ') }}
						</p>
						<p v-if="event.data.last_payment_error" class="mt-1 text-sm text-red-600 dark:text-red-400">
							{{ event.data.last_payment_error?.message }}
						</p>
						<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
							{{ formatDate(event.created) }}
						</p>
					</div>

					<div class="flex-shrink-0">
						<span
							class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
							:class="statusColorClass(event.data.status)"
						>
							{{ event.data.status?.replace(/_/g, ' ') }}
						</span>
					</div>
				</div>

				<div v-if="event.data.payment_method_details" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
					<p v-if="event.data.payment_method_details.type === 'card'">
						{{ event.data.payment_method_details.card?.brand.toUpperCase() }}
						•••• {{ event.data.payment_method_details.card?.last4 }}
					</p>
					<p v-else-if="event.data.payment_method_details.type === 'us_bank_account'">
						Bank Account •••• {{ event.data.payment_method_details.us_bank_account?.last4 }}
					</p>
				</div>
			</div>
		</div>

		<div
			v-else
			class="text-center p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
		>
			<p class="text-sm text-gray-500 dark:text-gray-400">No payment events found</p>
		</div>
	</div>
</template>
