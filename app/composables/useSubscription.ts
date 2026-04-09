// composables/useSubscription.ts
// Client-side subscription status management

interface SubscriptionPlan {
	id: string;
	amount: number;
	interval: string;
	product: any;
}

interface SubscriptionData {
	id: string;
	status: string;
	current_period_start: number;
	current_period_end: number;
	cancel_at_period_end: boolean;
	canceled_at: number | null;
	plan: SubscriptionPlan;
	default_payment_method: any;
}

interface PaymentMethod {
	id: string;
	brand: string;
	last4: string;
	exp_month: number;
	exp_year: number;
}

interface SubscriptionInvoice {
	id: string;
	number: string;
	amount_due: number;
	amount_paid: number;
	status: string;
	created: number;
	hosted_invoice_url: string;
	invoice_pdf: string;
}

interface SubscriptionStatus {
	status: string;
	subscription: SubscriptionData | null;
	customer: { id: string; email: string } | null;
	paymentMethods: PaymentMethod[];
	invoices: SubscriptionInvoice[];
}

export const useSubscription = () => {
	const { user } = useDirectusAuth();
	const loading = ref(false);
	const error = ref<string | null>(null);

	const subscriptionData = ref<SubscriptionStatus | null>(null);

	const isActive = computed(() => {
		const status = subscriptionData.value?.subscription?.status;
		return status === 'active' || status === 'trialing';
	});

	const isPastDue = computed(() => {
		return subscriptionData.value?.subscription?.status === 'past_due';
	});

	const isCanceling = computed(() => {
		return subscriptionData.value?.subscription?.cancel_at_period_end === true;
	});

	const currentPlan = computed(() => {
		return subscriptionData.value?.subscription?.plan || null;
	});

	const customerId = computed(() => {
		return subscriptionData.value?.customer?.id || (user.value as any)?.stripe_customer_id || null;
	});

	const paymentMethods = computed(() => {
		return subscriptionData.value?.paymentMethods || [];
	});

	const invoices = computed(() => {
		return subscriptionData.value?.invoices || [];
	});

	const periodEnd = computed(() => {
		const ts = subscriptionData.value?.subscription?.current_period_end;
		return ts ? new Date(ts * 1000) : null;
	});

	async function fetchStatus() {
		if (!user.value?.email) return;

		loading.value = true;
		error.value = null;

		try {
			const data = await $fetch<SubscriptionStatus>('/api/stripe/subscription/status', {
				params: {
					email: user.value.email,
					customerId: (user.value as any).stripe_customer_id || undefined,
				},
			});
			subscriptionData.value = data;
		} catch (err: any) {
			error.value = err.data?.message || err.message || 'Failed to fetch subscription';
			console.error('[useSubscription] fetch error:', err);
		} finally {
			loading.value = false;
		}
	}

	async function startCheckout(priceId: string) {
		if (!user.value?.email) return;

		loading.value = true;
		try {
			const data = await $fetch<{ url: string }>('/api/stripe/subscription/checkout', {
				method: 'POST',
				body: {
					email: user.value.email,
					customerId: customerId.value,
					priceId,
				},
			});

			if (data.url) {
				window.location.href = data.url;
			}
		} catch (err: any) {
			error.value = err.data?.message || err.message || 'Failed to start checkout';
		} finally {
			loading.value = false;
		}
	}

	async function cancelSubscription(immediate = false) {
		const subId = subscriptionData.value?.subscription?.id;
		if (!subId) return;

		loading.value = true;
		try {
			await $fetch('/api/stripe/subscription/cancel', {
				method: 'POST',
				body: { subscriptionId: subId, immediate },
			});
			await fetchStatus();
		} catch (err: any) {
			error.value = err.data?.message || err.message || 'Failed to cancel';
		} finally {
			loading.value = false;
		}
	}

	async function resumeSubscription() {
		const subId = subscriptionData.value?.subscription?.id;
		if (!subId) return;

		loading.value = true;
		try {
			await $fetch('/api/stripe/subscription/resume', {
				method: 'POST',
				body: { subscriptionId: subId },
			});
			await fetchStatus();
		} catch (err: any) {
			error.value = err.data?.message || err.message || 'Failed to resume';
		} finally {
			loading.value = false;
		}
	}

	async function openPortal() {
		if (!customerId.value) return;

		loading.value = true;
		try {
			const data = await $fetch<{ url: string }>('/api/stripe/subscription/portal', {
				method: 'POST',
				body: { customerId: customerId.value },
			});

			if (data.url) {
				window.location.href = data.url;
			}
		} catch (err: any) {
			error.value = err.data?.message || err.message || 'Failed to open portal';
		} finally {
			loading.value = false;
		}
	}

	return {
		loading: readonly(loading),
		error: readonly(error),
		subscriptionData: readonly(subscriptionData),
		isActive,
		isPastDue,
		isCanceling,
		currentPlan,
		customerId,
		paymentMethods,
		invoices,
		periodEnd,
		fetchStatus,
		startCheckout,
		cancelSubscription,
		resumeSubscription,
		openPortal,
	};
};
