<script setup lang="ts">
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Invoice | Client Portal' });

const route = useRoute();
const { user: sessionUser } = useUserSession();

// Archive unread bell rows for this invoice on mount.
useMarkItemRead('invoices', () => route.params.id as string);

const invoice = ref<any>(null);
const loadError = ref<string | null>(null);

try {
	invoice.value = await $fetch(`/api/portal/invoice/${route.params.id}`);
} catch (err: any) {
	loadError.value = err?.statusMessage || err?.message || 'Failed to load invoice';
}

const portalUser = computed(() => (sessionUser.value ? { email: sessionUser.value.email } : null));
const defaultEmail = computed(() => {
	return (
		invoice.value?.billing_email
		|| invoice.value?.client?.billing_contacts?.[0]?.email
		|| invoice.value?.client?.billing_email
		|| invoice.value?.bill_to?.emails?.[0]
		|| sessionUser.value?.email
		|| ''
	);
});
</script>

<template>
	<div class="portal-page">
		<AppHeader
			:title="invoice?.invoice_code || 'Invoice'"
			show-back
			back-label="Invoices"
		/>

		<LayoutPageContainer>
		<div v-if="loadError" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:alert-circle" class="w-10 h-10 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">{{ loadError }}</p>
			<NuxtLink to="/portal/invoices" class="text-xs text-primary hover:underline">Back to invoices</NuxtLink>
		</div>

		<div v-else-if="invoice" class="w-full flex flex-col items-center justify-center">
			<div class="w-full flex flex-col lg:flex-row items-center lg:items-start justify-center relative z-10">
				<InvoicesInvoice :invoice="invoice" class="lg:sticky lg:top-12" />

				<div v-if="invoice.status === 'pending'" class="w-full px-6 pt-0 pb-16 lg:w-1/2 max-w-xl">
					<UButton
						v-if="invoice.melio"
						:to="invoice.melio"
						target="_blank"
						class="w-full mb-6"
						color="gray"
						variant="solid"
						size="sm"
					>
						Pay with Melio
					</UButton>
					<PaymentMethods
						:amount="invoice.total_amount"
						:email="defaultEmail"
						:bill_to="invoice.bill_to"
						:user="portalUser"
						:invoice="invoice"
						:is-anonymous="false"
					/>
				</div>

				<div
					v-else-if="invoice.payments?.length"
					class="w-full px-6 pt-0 pb-16 lg:w-1/2 max-w-xl"
				>
					<h3 class="uppercase font-bold tracking-wide border-b border-gray-200 dark:border-gray-700">Payments</h3>
					<div v-for="payment in invoice.payments" :key="payment.id">
						<InvoicesPaymentItem :payment="payment" />
					</div>
				</div>
			</div>
		</div>
		</LayoutPageContainer>
	</div>
</template>
