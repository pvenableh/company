<script setup lang="ts">
import { format } from 'date-fns';
import { toast } from 'vue-sonner';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Subscription | Earnest' });

const {
	loading,
	subscriptionData,
	isActive,
	isPastDue,
	isCanceling,
	currentPlan,
	customerId,
	paymentMethods,
	invoices,
	periodEnd,
	fetchStatus,
	cancelSubscription,
	resumeSubscription,
	openPortal,
} = useSubscription();

const showCancelConfirm = ref(false);
const route = useRoute();

// Fetch subscription status on mount
onMounted(async () => {
	await fetchStatus();

	// Handle return from Stripe Checkout
	if (route.query.session_id) {
		toast.success('Subscription activated!', {
			description: 'Your subscription is now active.',
		});
		navigateTo('/account/subscription', { replace: true });
	}
});

const statusBadge = computed(() => {
	const status = subscriptionData.value?.subscription?.status;
	if (!status || status === 'none' || subscriptionData.value?.status === 'no_customer') {
		return { label: 'No Plan', color: 'gray' as const };
	}
	const map: Record<string, { label: string; color: 'green' | 'yellow' | 'red' | 'blue' | 'gray' }> = {
		active: { label: 'Active', color: 'green' },
		trialing: { label: 'Trial', color: 'blue' },
		past_due: { label: 'Past Due', color: 'red' },
		canceled: { label: 'Canceled', color: 'gray' },
		incomplete: { label: 'Incomplete', color: 'yellow' },
		unpaid: { label: 'Unpaid', color: 'red' },
	};
	return map[status] || { label: status, color: 'gray' as const };
});

const planName = computed(() => {
	if (!currentPlan.value) return 'No active plan';
	const product = currentPlan.value.product;
	if (typeof product === 'object' && product?.name) return product.name;
	return 'Unknown Plan';
});

const planPrice = computed(() => {
	if (!currentPlan.value?.amount) return null;
	const amount = currentPlan.value.amount / 100;
	const interval = currentPlan.value.interval || 'month';
	return `$${amount.toFixed(2)}/${interval}`;
});

function formatDate(timestamp: number) {
	return format(new Date(timestamp * 1000), 'MMM d, yyyy');
}

function formatCurrency(cents: number) {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	}).format(cents / 100);
}

async function handleCancel() {
	showCancelConfirm.value = false;
	await cancelSubscription();
	toast.success('Subscription will cancel at end of billing period');
}

async function handleResume() {
	await resumeSubscription();
	toast.success('Subscription resumed!');
}

async function handleManageBilling() {
	await openPortal();
}
</script>

<template>
	<div class="p-4 md:p-6 max-w-3xl mx-auto">
		<div class="mb-8">
			<h1 class="text-2xl font-bold text-foreground">Subscription & Billing</h1>
			<p class="text-sm text-muted-foreground mt-1">Manage your Earnest plan, billing, and payment methods.</p>
		</div>

		<!-- Loading State -->
		<div v-if="loading && !subscriptionData" class="space-y-4">
			<div v-for="i in 3" :key="i" class="rounded-xl border bg-card p-6 animate-pulse">
				<div class="h-4 bg-muted rounded w-1/3 mb-3" />
				<div class="h-3 bg-muted rounded w-2/3" />
			</div>
		</div>

		<template v-else>
			<!-- Past Due Alert -->
			<div v-if="isPastDue" class="rounded-xl border-2 border-red-300 bg-red-50 dark:bg-red-900/20 p-4 mb-6">
				<div class="flex items-start gap-3">
					<UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-500 mt-0.5" />
					<div class="flex-1">
						<h3 class="font-semibold text-red-800 dark:text-red-300">Payment Past Due</h3>
						<p class="text-sm text-red-600 dark:text-red-400 mt-1">
							Your last payment failed. Please update your payment method to keep your subscription active.
						</p>
						<UButton size="sm" color="red" class="mt-3" @click="handleManageBilling">
							Update Payment Method
						</UButton>
					</div>
				</div>
			</div>

			<!-- Canceling Notice -->
			<div v-if="isCanceling" class="rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-4 mb-6">
				<div class="flex items-start gap-3">
					<UIcon name="i-heroicons-clock" class="w-5 h-5 text-amber-500 mt-0.5" />
					<div class="flex-1">
						<h3 class="font-semibold text-amber-800 dark:text-amber-300">Subscription Canceling</h3>
						<p class="text-sm text-amber-600 dark:text-amber-400 mt-1">
							Your subscription will end on
							<strong>{{ periodEnd ? format(periodEnd, 'MMMM d, yyyy') : '—' }}</strong>.
							You'll retain access until then.
						</p>
						<UButton size="sm" color="amber" variant="soft" class="mt-3" :loading="loading" @click="handleResume">
							Resume Subscription
						</UButton>
					</div>
				</div>
			</div>

			<!-- Current Plan -->
			<div class="rounded-xl border bg-card p-6 mb-6">
				<div class="flex items-center justify-between mb-4">
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
							<UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary-foreground" />
						</div>
						<div>
							<h2 class="font-semibold text-foreground">{{ planName }}</h2>
							<p class="text-xs text-muted-foreground">
								<template v-if="planPrice">{{ planPrice }}</template>
								<template v-else>Your current plan</template>
							</p>
						</div>
					</div>
					<UBadge :color="statusBadge.color" variant="soft">{{ statusBadge.label }}</UBadge>
				</div>

				<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
					<div>
						<p class="text-muted-foreground">Plan</p>
						<p class="font-medium">{{ planName }}</p>
					</div>
					<div>
						<p class="text-muted-foreground">Price</p>
						<p class="font-medium">{{ planPrice || '—' }}</p>
					</div>
					<div>
						<p class="text-muted-foreground">Status</p>
						<p class="font-medium capitalize">{{ subscriptionData?.subscription?.status || '—' }}</p>
					</div>
					<div>
						<p class="text-muted-foreground">Next Billing</p>
						<p class="font-medium">
							{{ periodEnd ? format(periodEnd, 'MMM d, yyyy') : '—' }}
						</p>
					</div>
				</div>

				<!-- Plan Actions -->
				<div v-if="isActive || isPastDue" class="flex items-center gap-2 mt-6 pt-4 border-t">
					<UButton size="sm" variant="soft" :loading="loading" @click="handleManageBilling">
						Manage Billing
					</UButton>
					<UButton
						v-if="!isCanceling"
						size="sm"
						variant="ghost"
						color="red"
						@click="showCancelConfirm = true"
					>
						Cancel Plan
					</UButton>
				</div>
			</div>

			<!-- Payment Methods -->
			<div class="rounded-xl border bg-card p-6 mb-6">
				<h3 class="font-semibold text-foreground mb-4 flex items-center gap-2">
					<UIcon name="i-heroicons-credit-card" class="w-5 h-5" />
					Payment Methods
				</h3>

				<div v-if="paymentMethods.length === 0" class="flex items-center justify-between">
					<p class="text-sm text-muted-foreground">No payment method on file</p>
					<UButton size="sm" variant="soft" :loading="loading" @click="handleManageBilling">
						Add Payment Method
					</UButton>
				</div>

				<div v-else class="space-y-3">
					<div
						v-for="pm in paymentMethods"
						:key="pm.id"
						class="flex items-center justify-between py-2"
					>
						<div class="flex items-center gap-3">
							<UIcon name="i-lucide-credit-card" class="w-5 h-5 text-muted-foreground" />
							<div>
								<p class="text-sm font-medium text-foreground capitalize">
									{{ pm.brand }} &bull;&bull;&bull;&bull; {{ pm.last4 }}
								</p>
								<p class="text-xs text-muted-foreground">
									Expires {{ pm.exp_month }}/{{ pm.exp_year }}
								</p>
							</div>
						</div>
					</div>

					<div class="pt-2">
						<UButton size="sm" variant="ghost" :loading="loading" @click="handleManageBilling">
							Manage Payment Methods
						</UButton>
					</div>
				</div>
			</div>

			<!-- Billing History -->
			<div class="rounded-xl border bg-card p-6">
				<h3 class="font-semibold text-foreground mb-4 flex items-center gap-2">
					<UIcon name="i-heroicons-document-text" class="w-5 h-5" />
					Billing History
				</h3>

				<div v-if="invoices.length === 0" class="text-center py-8">
					<UIcon name="i-heroicons-document-text" class="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
					<p class="text-sm text-muted-foreground">No billing history yet</p>
				</div>

				<div v-else class="divide-y">
					<div
						v-for="inv in invoices"
						:key="inv.id"
						class="flex items-center justify-between py-3"
					>
						<div class="flex items-center gap-3">
							<UIcon name="i-heroicons-document-text" class="w-4 h-4 text-muted-foreground" />
							<div>
								<p class="text-sm font-medium text-foreground">
									{{ inv.number || 'Invoice' }}
								</p>
								<p class="text-xs text-muted-foreground">
									{{ formatDate(inv.created) }}
								</p>
							</div>
						</div>
						<div class="flex items-center gap-3">
							<span class="text-sm font-medium">{{ formatCurrency(inv.amount_paid || inv.amount_due) }}</span>
							<UBadge
								:color="inv.status === 'paid' ? 'green' : inv.status === 'open' ? 'yellow' : 'gray'"
								variant="soft"
								size="xs"
							>
								{{ inv.status }}
							</UBadge>
							<UButton
								v-if="inv.hosted_invoice_url"
								:to="inv.hosted_invoice_url"
								target="_blank"
								size="xs"
								variant="ghost"
								icon="i-heroicons-arrow-top-right-on-square"
							/>
						</div>
					</div>
				</div>
			</div>
		</template>

		<!-- Cancel Confirmation Modal -->
		<UModal v-model:open="showCancelConfirm">
			<template #content>
				<div class="p-6">
					<div class="flex items-start gap-4">
						<div class="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
							<UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-500" />
						</div>
						<div class="flex-1">
							<h3 class="text-lg font-semibold text-foreground">Cancel Subscription?</h3>
							<p class="text-sm text-muted-foreground mt-2">
								Your subscription will remain active until the end of your current billing period
								<strong v-if="periodEnd">({{ format(periodEnd, 'MMMM d, yyyy') }})</strong>.
								After that, you'll lose access to your plan's features.
							</p>
							<div class="flex items-center gap-2 mt-6">
								<UButton color="red" :loading="loading" @click="handleCancel">
									Cancel Subscription
								</UButton>
								<UButton variant="ghost" @click="showCancelConfirm = false">
									Keep Subscription
								</UButton>
							</div>
						</div>
					</div>
				</div>
			</template>
		</UModal>
	</div>
</template>
