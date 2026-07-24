<script setup>
// Public payment surface — no app chrome. The global apps-layout middleware
// wraps every in-app route in the apps shell (nav rail, dock, assistant), which
// an unauthenticated payer should never see. `blank` still inherits the root
// theme (dark-default colorMode + data-theme/data-style + palette applied on
// <html> by app.vue), so the page stays on-brand without the internal nav.
import { resolveBillingRecipients } from '~~/shared/billing-recipients';
definePageMeta({ layout: 'blank' });
useHead({ title: 'Invoice | Earnest' });

const { params } = useRoute();

// Archive any unread bell rows for this invoice on mount.
useMarkItemRead('invoices', () => params.id);
const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
import * as yup from 'yup';
const toast = useToast();

const emailSchema = yup.object({
	email: yup.string().email('Please enter a valid email address').required('Email is required'),
});

// Classify the viewer relative to this invoice. Portal users are bounced to
// /portal/invoices/[id] so there's a single payment surface per audience;
// staff in the merchant org see a view-only page (paying themselves makes no
// sense). Anonymous + unrelated logged-in viewers get the normal pay flow.
const viewerMode = ref('anonymous');
if (loggedIn.value) {
	const res = await $fetch(`/api/invoices/${params.id}/viewer-mode`).catch(() => ({ mode: 'unrelated' }));
	viewerMode.value = res?.mode ?? 'unrelated';
	if (viewerMode.value === 'portal') {
		await navigateTo(`/portal/invoices/${params.id}`, { replace: true });
	}
}
const isStaffViewer = computed(() => viewerMode.value === 'staff');

// The Directus Public policy no longer grants anonymous `read` on `invoices`,
// so we can't hit the generic items proxy here (it 403s for logged-out payers).
// Instead fetch via the admin-token public endpoint — the invoice UUID is the
// capability, and the collection stays unlistable. Logged-in staff/unrelated
// viewers use the same route (server returns the single invoice by id).
const { data: invoiceData, error: invoiceError } = await useFetch(`/api/public/invoice/${params.id}`);
if (invoiceError.value || !invoiceData.value) {
	throw createError({ statusCode: 404, statusMessage: 'Invoice not found' });
}
const invoice = invoiceData.value;

const anonymousUser = ref(null);
const showAnonymousForm = computed(() => {
	return !user.value && (!anonymousUser.value || !anonymousUser.value.email.trim());
});

const defaultEmail = computed(() => {
	// Same source of truth as the send (client billing contacts), then snapshot,
	// client scalar, org.
	return resolveBillingRecipients([invoice.client]).to?.email || invoice.billing_email || invoice.client?.billing_email || invoice.bill_to?.emails?.[0] || '';
});

// const handleAnonymousSubmit = async (formData) => {
// 	if (formData.email.trim()) {
// 		anonymousUser.value = {
// 			email: formData.email,
// 		};
// 	}
// };

const handleAnonymousSubmit = async (formData) => {
	try {
		// Validate email format using yup
		await emailSchema.validate({ email: formData.email });

		anonymousUser.value = {
			email: formData.email,
		};
	} catch (error) {
		toast.add({
			title: 'Invalid Email',
			description: error.message,
			color: 'red',
		});
	}
};
</script>
<template>
	<div class="w-full flex flex-col items-center justify-center">
		<div v-if="user" class="w-full max-w-screen-xl mx-auto z-10">
			<nuxt-link to="/invoices" class="uppercase text-[10px] text-gray-400 px-4 2xl:px-0">
				<EIcon name="i-heroicons-arrow-left" class="-mb-0.5" />
				Back to Invoices
			</nuxt-link>
		</div>

		<div class="w-full flex flex-col lg:flex-row items-center lg:items-start justify-center relative z-10 mt-12">
			<InvoicesInvoice :invoice="invoice" class="lg:sticky lg:top-12" />

			<div v-if="isStaffViewer && invoice.status === 'pending'" class="w-full px-6 pt-0 pb-16 lg:w-1/2 max-w-xl">
				<div class="rounded-md border border-gray-200 dark:border-gray-700 p-4 text-sm text-muted-foreground">
					<p class="font-medium text-foreground mb-1">View only</p>
					<p>You're a member of this organization, so payment isn't available here.</p>
					<NuxtLink :to="`/invoices/detail/${invoice.id}`" class="inline-block mt-3 text-primary hover:underline">
						Open in admin →
					</NuxtLink>
				</div>
			</div>

			<div v-else-if="showAnonymousForm && invoice.status === 'pending'" class="w-full px-6 pt-0 pb-16 lg:w-1/2 max-w-xl">
				<EButton
					v-if="invoice.melio"
					:to="invoice.melio"
					target="_blank"
					class="w-full mb-6"
					color="gray"
					variant="ghost"
					size="sm"
				>
					Pay with Melio
				</EButton>
				<PaymentAnonymous :default-email="defaultEmail" @submit="handleAnonymousSubmit" />
			</div>

			<div v-else-if="invoice.status === 'pending'" class="w-full px-6 pt-0 pb-16 lg:w-1/2 max-w-xl">
				<EButton
					v-if="invoice.melio"
					:to="invoice.melio"
					target="_blank"
					class="w-full mb-6"
					color="gray"
					variant="solid"
					size="sm"
				>
					Pay with Melio
				</EButton>
				<PaymentMethods
					:amount="invoice.total_amount"
					:email="user ? user.email : anonymousUser.email"
					:bill_to="invoice.bill_to"
					:user="user || anonymousUser"
					:invoice="invoice"
					:is-anonymous="!user"
				/>
			</div>
			<div
				v-else-if="invoice.status !== 'pending' && invoice.payments.length && !showAnonymousForm"
				class="w-full px-6 pt-0 pb-16 lg:w-1/2 max-w-xl"
			>
				<h3 class="uppercase font-bold tracking-wide border-b border-gray-200 dark:border-gray-700">Payments</h3>
				<div v-for="payment in invoice.payments" :key="payment.id">
					<!-- <h5>{{ payment.payment_method }}</h5>
					<h5>{{ payment.stripe_status }}</h5>
					<EButton
						:href="payment.receipt_url"
						target="_blank"
						size="xs"
						class="mb-2"
						label="Stripe Receipt"
						:ui="{ rounded: 'rounded-full' }"
					/>
					<h5>{{ payment.status }}</h5> -->

					<InvoicesPaymentItem :payment="payment" />
				</div>
			</div>
		</div>
	</div>
</template>
<style></style>
