<script setup>
definePageMeta({
	middleware: ['auth'],
});

const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const paymentsReceivedItems = useDirectusItems('payments_received');
const { canAccess } = useRole();

const payments = await paymentsReceivedItems.list({
	fields: ['*,invoice_id.*'],
	sort: 'date_received',
});
</script>
<template>
	<div>
		<h1 class="page__title">Payments</h1>
		<div class="w-full flex flex-col items-center justify-center z-10 page__inner">
			<div class="w-full max-w-xl" v-if="canAccess('invoices')">
				<h2 class="text-xl mb-2 font-thin">Payments</h2>
				<div class="grid gap-6 grid-cols-1 sm:grid-cols-2">
					{{ payments }}
				</div>
			</div>
		</div>
	</div>
</template>
