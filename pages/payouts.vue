<script setup>
definePageMeta({
	middleware: ['auth'],
});
const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const { isAdmin } = useRole();

const admin = computed(() => {
	return isAdmin(user.value);
});
// Fetch all payouts when the component loads
const { data: payouts, error } = useFetch('/api/stripe/payouts');

// Store selected payout details
const selectedPayout = ref(null);
const detailsError = ref(null);

// Function to fetch details of a single payout
const fetchPayoutDetails = async (payoutId) => {
	console.log(payoutId);
	try {
		selectedPayout.value = await $fetch(`/api/stripe/payouts/${payoutId}`);
		console.log(selectedPayout.value);
	} catch (err) {
		detailsError.value = err.message;
	}
};
</script>

<template>
	<div class="w-full relative">
		<h1 class="page__title">Stripe</h1>
		<div class="grid gap-6 grid-cols-1 md:grid-cols-2 page__inner">
			<div class="" v-if="admin">
				<ul>
					<li v-for="payout in payouts" :key="payout.id">
						{{ payout.amount }} - {{ payout.status }}
						<button @click="fetchPayoutDetails(payout.id)">View Details</button>
					</li>
				</ul>
			</div>
			<div class="">
				<div v-if="selectedPayout" class="relative">
					<h2>Payout Details</h2>
					{{ selectedPayout }}
					<p>Amount: {{ selectedPayout.amount }}</p>
					<p>Status: {{ selectedPayout.status }}</p>
				</div>
			</div>
		</div>
	</div>
</template>
