<!--
	SubscriptionSurface — shared body of the Subscription & Billing screen.
	Renders the Stripe plan summary + payment methods + invoice history.
	Used full-page by `/account/subscription` (deep-link + Stripe return URL
	receiver) and inside `AccountSubscriptionPanel` as a slide-over from
	the Integrations floor's Plaid CTA.

	`compact` drops the outer page heading (the panel shell shows it).
-->
<script setup lang="ts">
import { format } from 'date-fns';
import { toast } from 'vue-sonner';

const props = defineProps<{
	compact?: boolean;
}>();

const emit = defineEmits<{
	(e: 'loaded'): void;
}>();

const {
	loading,
	subscriptionData,
	isActive,
	isPastDue,
	isCanceling,
	currentPlan,
	paymentMethods,
	invoices,
	periodEnd,
	fetchStatus,
	cancelSubscription,
	resumeSubscription,
	openPortal,
} = useSubscription();

// Entitlement/tier (Directus `organizations.plan`) is a separate axis from the
// live Stripe billing status below — an enterprise/wholesale org (e.g. hue) is
// fully entitled with no Stripe subscription, so the badge/plan name must read
// `plan` before falling back to the Stripe lookup.
const { isOrgAdminOrAbove, hasAddon, planAllows, orgPlan } = useOrgRole();
const { selectedOrg, fetchOrganizationDetails } = useOrganization();
const isEnterprise = computed(() => orgPlan.value === 'enterprise');

const showCancelConfirm = ref(false);
const route = useRoute();
const router = useRouter();

onMounted(async () => {
	await fetchStatus();
	emit('loaded');

	if (route.query.session_id) {
		toast.success('Subscription activated!', {
			description: 'Your subscription is now active.',
		});
		const { session_id, ...rest } = route.query;
		void session_id;
		router.replace({ path: route.path, query: rest });
	}
});

const statusBadge = computed(() => {
	// Enterprise/wholesale orgs are entitled via `plan`, not a Stripe sub — show
	// their tier rather than the "No Plan" state that a missing customer yields.
	if (isEnterprise.value) {
		return { label: 'Enterprise', color: 'blue' as const };
	}
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
	if (isEnterprise.value) return 'Enterprise — all features included';
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
	return getFriendlyDateThree(new Date(timestamp * 1000));
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

// ── Add-ons ─────────────────────────────────────────────────────────────────
// Post-signup add-on management. The 6 add-ons mirror EARNEST_ADDONS in
// server/utils/stripe.ts; the canonical Stripe price ids live server-side and
// the client only references add-on ids + human copy (same contract as the
// signup wizard in pages/organization/new.vue).
// (useOrgRole / useOrganization / isEnterprise are declared up top so the
// status badge and plan name can read the tier.)

interface AddonCatalogEntry {
	id: string;
	name: string;
	price: number; // dollars/mo (EARNEST_ADDONS.monthlyAmount / 100)
	blurb: string;
	agencyOnly?: boolean;
}

const ADDON_CATALOG: AddonCatalogEntry[] = [
	{ id: 'extra_seats_5', name: 'Extra Seats', price: 15, blurb: '+5 team seats' },
	{ id: 'communications', name: 'Communications', price: 49, blurb: 'Phone, SMS, video & live chat' },
	{ id: 'client_pack_starter', name: 'Client Pack Starter', price: 29, blurb: '+5 client portal seats · 50K tokens' },
	{ id: 'client_pack_pro', name: 'Client Pack Pro', price: 59, blurb: '+10 client portal seats · 150K tokens' },
	{ id: 'client_pack_unlimited', name: 'Client Pack Unlimited', price: 129, blurb: 'Unlimited client portals · 500K tokens' },
	{ id: 'white_label', name: 'Companion White-Label', price: 19, blurb: 'Remove Earnest branding', agencyOnly: true },
];

// White-label is agency-gated (planAllows) and shown to enterprise too.
const visibleAddons = computed(() =>
	ADDON_CATALOG.filter((a) => !a.agencyOnly || planAllows('white_label')),
);

// Enterprise implicitly owns every add-on (internal/wholesale orgs like hue) —
// render them as "Included with your plan" rather than cancellable line items.
// `isEnterprise` is declared up top (used by the status badge too).

// Subscribing requires an active base subscription for subscriptionItems.create.
// Enterprise needs no sub (everything is included).
const canSubscribeAddons = computed(() => isActive.value);

// Optimistic overlay: after a subscribe/cancel the webhook updates
// active_addons asynchronously, so we flip local state immediately and
// reconcile against the refetched org (allowing for webhook latency).
const addonOptimistic = reactive<Record<string, boolean>>({});
const addonPending = reactive<Record<string, boolean>>({});
const addonToCancel = ref<string | null>(null);
// Drives the cancel-confirm UModal via its `v-model` (modelValue) contract.
const showAddonCancel = computed({
	get: () => !!addonToCancel.value,
	set: (v: boolean) => {
		if (!v) addonToCancel.value = null;
	},
});

function isAddonActive(id: string): boolean {
	if (id in addonOptimistic) return addonOptimistic[id];
	return hasAddon(id);
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Poll the org record until active_addons reflects the expected state (webhook
// caught up) or we exhaust our attempts, then drop the optimistic overlay.
async function reconcileAddon(id: string, expected: boolean) {
	for (const delay of [1500, 2500, 4000, 6000]) {
		await wait(delay);
		await fetchOrganizationDetails();
		if (hasAddon(id) === expected) break;
	}
	delete addonOptimistic[id];
	addonPending[id] = false;
}

async function handleSubscribeAddon(id: string) {
	if (!isOrgAdminOrAbove.value || addonPending[id]) return;
	if (!canSubscribeAddons.value) {
		toast.error('Start a plan first', {
			description: 'Add-ons attach to an active subscription. Choose a plan, then add these.',
		});
		return;
	}
	if (!selectedOrg.value) {
		toast.error('No organization selected');
		return;
	}

	addonPending[id] = true;
	addonOptimistic[id] = true;
	try {
		await $fetch('/api/stripe/addons/subscribe', {
			method: 'POST',
			body: { addonId: id, orgId: selectedOrg.value },
		});
		toast.success('Add-on added', { description: 'Billing updates on your next invoice.' });
		void reconcileAddon(id, true);
	} catch (err: any) {
		delete addonOptimistic[id];
		addonPending[id] = false;
		toast.error(err?.data?.message || 'Failed to add add-on');
	}
}

async function handleCancelAddon() {
	const id = addonToCancel.value;
	addonToCancel.value = null;
	if (!id || !isOrgAdminOrAbove.value || addonPending[id]) return;
	if (!selectedOrg.value) {
		toast.error('No organization selected');
		return;
	}

	addonPending[id] = true;
	addonOptimistic[id] = false;
	try {
		await $fetch('/api/stripe/addons/cancel', {
			method: 'POST',
			body: { addonId: id, orgId: selectedOrg.value },
		});
		toast.success('Add-on removed');
		void reconcileAddon(id, false);
	} catch (err: any) {
		delete addonOptimistic[id];
		addonPending[id] = false;
		toast.error(err?.data?.message || 'Failed to remove add-on');
	}
}
</script>

<template>
	<div :class="compact ? 'space-y-4' : ''">
		<div v-if="!compact" class="mb-8">
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
			<div v-if="isPastDue" class="rounded-xl border-2 border-destructive/30 bg-destructive/10 dark:bg-destructive/20 p-4 mb-6">
				<div class="flex items-start gap-3">
					<EIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-destructive mt-0.5" />
					<div class="flex-1">
						<h3 class="font-semibold text-destructive dark:text-destructive">Payment Past Due</h3>
						<p class="text-sm text-destructive dark:text-destructive mt-1">
							Your last payment failed. Please update your payment method to keep your subscription active.
						</p>
						<EButton size="sm" color="red" class="mt-3" @click="handleManageBilling">
							Update Payment Method
						</EButton>
					</div>
				</div>
			</div>

			<!-- Canceling Notice -->
			<div v-if="isCanceling" class="rounded-xl border-2 border-warning/30 bg-warning/10 dark:bg-warning/20 p-4 mb-6">
				<div class="flex items-start gap-3">
					<EIcon name="i-heroicons-clock" class="w-5 h-5 text-warning mt-0.5" />
					<div class="flex-1">
						<h3 class="font-semibold text-warning dark:text-warning">Subscription Canceling</h3>
						<p class="text-sm text-warning dark:text-warning mt-1">
							Your subscription will end on
							<strong>{{ periodEnd ? format(periodEnd, 'MMMM d, yyyy') : '—' }}</strong>.
							You'll retain access until then.
						</p>
						<EButton size="sm" color="amber" variant="soft" class="mt-3" :loading="loading" @click="handleResume">
							Resume Subscription
						</EButton>
					</div>
				</div>
			</div>

			<!-- Current Plan -->
			<div class="rounded-xl border bg-card p-6 mb-6">
				<div class="flex items-center justify-between mb-4">
					<div class="flex items-center gap-3">
						<div class="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
							<EarnestIcon class="w-5 h-5 text-primary-foreground" />
						</div>
						<div>
							<h2 class="font-semibold text-foreground">{{ planName }}</h2>
							<p class="text-xs text-muted-foreground">
								<template v-if="planPrice">{{ planPrice }}</template>
								<template v-else>Your current plan</template>
							</p>
						</div>
					</div>
					<EBadge :color="statusBadge.color" variant="soft">{{ statusBadge.label }}</EBadge>
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
					<EButton size="sm" variant="soft" :loading="loading" @click="handleManageBilling">
						Manage Billing
					</EButton>
					<EButton
						v-if="!isCanceling"
						size="sm"
						variant="ghost"
						color="red"
						@click="showCancelConfirm = true"
					>
						Cancel Plan
					</EButton>
				</div>
			</div>

			<!-- Add-ons -->
			<div class="rounded-xl border bg-card p-6 mb-6">
				<div class="flex items-center justify-between mb-1">
					<h3 class="font-semibold text-foreground flex items-center gap-2">
						<EIcon name="i-heroicons-squares-plus" class="w-5 h-5" />
						Add-ons
					</h3>
					<EBadge v-if="isEnterprise" color="blue" variant="soft" size="xs">Enterprise</EBadge>
				</div>
				<p class="text-xs text-muted-foreground mb-4">
					<template v-if="isEnterprise">Every add-on is included with your plan.</template>
					<template v-else>Optional capabilities, billed monthly alongside your plan.</template>
				</p>

				<!-- No active subscription: can't attach add-ons yet -->
				<div
					v-if="!isEnterprise && !canSubscribeAddons"
					class="rounded-lg border border-warning/40 bg-warning/10 dark:bg-warning/20 p-3 mb-4 flex items-start gap-2"
				>
					<EIcon name="i-heroicons-information-circle" class="w-4 h-4 text-warning mt-0.5 shrink-0" />
					<p class="text-xs text-warning">
						Add-ons attach to an active plan. Start a plan first, then add these here.
					</p>
				</div>

				<div class="space-y-2">
					<div
						v-for="addon in visibleAddons"
						:key="addon.id"
						class="p-3.5 rounded-xl border flex items-center gap-3"
						:class="isAddonActive(addon.id) ? 'border-primary/40 bg-primary/5' : 'border-border'"
					>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 flex-wrap">
								<span class="text-sm font-semibold text-foreground">{{ addon.name }}</span>
								<EBadge v-if="isEnterprise" color="blue" variant="soft" size="xs">Included</EBadge>
								<EBadge v-else-if="isAddonActive(addon.id)" color="green" variant="soft" size="xs">Active</EBadge>
							</div>
							<p class="text-[10px] text-muted-foreground mt-0.5">{{ addon.blurb }}</p>
						</div>

						<div class="text-right shrink-0">
							<span class="text-sm font-bold text-foreground">${{ addon.price }}</span>
							<span class="text-[10px] text-muted-foreground ml-0.5">/mo</span>
						</div>

						<!-- Actions: owner/admin only. Enterprise = included, no controls. -->
						<div v-if="isOrgAdminOrAbove && !isEnterprise" class="shrink-0 w-24 flex justify-end">
							<EButton
								v-if="isAddonActive(addon.id)"
								size="xs"
								variant="ghost"
								color="red"
								:loading="addonPending[addon.id]"
								@click="addonToCancel = addon.id"
							>
								Cancel
							</EButton>
							<EButton
								v-else
								size="xs"
								:loading="addonPending[addon.id]"
								:disabled="!canSubscribeAddons"
								@click="handleSubscribeAddon(addon.id)"
							>
								Subscribe
							</EButton>
						</div>
					</div>
				</div>
			</div>

			<!-- Payment Methods -->
			<div class="rounded-xl border bg-card p-6 mb-6">
				<h3 class="font-semibold text-foreground mb-4 flex items-center gap-2">
					<EIcon name="i-heroicons-credit-card" class="w-5 h-5" />
					Payment Methods
				</h3>

				<div v-if="paymentMethods.length === 0" class="flex items-center justify-between">
					<p class="text-sm text-muted-foreground">No payment method on file</p>
					<EButton size="sm" variant="soft" :loading="loading" @click="handleManageBilling">
						Add Payment Method
					</EButton>
				</div>

				<div v-else class="space-y-3">
					<div
						v-for="pm in paymentMethods"
						:key="pm.id"
						class="flex items-center justify-between py-2"
					>
						<div class="flex items-center gap-3">
							<EIcon name="i-lucide-credit-card" class="w-5 h-5 text-muted-foreground" />
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
						<EButton size="sm" variant="ghost" :loading="loading" @click="handleManageBilling">
							Manage Payment Methods
						</EButton>
					</div>
				</div>
			</div>

			<!-- Billing History -->
			<div class="rounded-xl border bg-card p-6">
				<h3 class="font-semibold text-foreground mb-4 flex items-center gap-2">
					<EIcon name="i-heroicons-document-text" class="w-5 h-5" />
					Billing History
				</h3>

				<div v-if="invoices.length === 0" class="text-center py-8">
					<EIcon name="i-heroicons-document-text" class="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
					<p class="text-sm text-muted-foreground">No billing history yet</p>
				</div>

				<div v-else class="divide-y">
					<div
						v-for="inv in invoices"
						:key="inv.id"
						class="flex items-center justify-between py-3"
					>
						<div class="flex items-center gap-3">
							<EIcon name="i-heroicons-document-text" class="w-4 h-4 text-muted-foreground" />
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
							<EBadge
								:color="inv.status === 'paid' ? 'green' : inv.status === 'open' ? 'yellow' : 'gray'"
								variant="soft"
								size="xs"
							>
								{{ inv.status }}
							</EBadge>
							<EButton
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
		<EModal v-model="showCancelConfirm">
			<div class="flex items-start gap-4">
				<div class="w-10 h-10 rounded-full bg-destructive/10 dark:bg-destructive/30 flex items-center justify-center">
					<EIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-destructive" />
				</div>
				<div class="flex-1">
					<h3 class="text-lg font-semibold text-foreground">Cancel Subscription?</h3>
					<p class="text-sm text-muted-foreground mt-2">
						Your subscription will remain active until the end of your current billing period
						<strong v-if="periodEnd">({{ format(periodEnd, 'MMMM d, yyyy') }})</strong>.
						After that, you'll lose access to your plan's features.
					</p>
					<div class="flex items-center gap-2 mt-6">
						<EButton color="red" :loading="loading" @click="handleCancel">
							Cancel Subscription
						</EButton>
						<EButton variant="ghost" @click="showCancelConfirm = false">
							Keep Subscription
						</EButton>
					</div>
				</div>
			</div>
		</EModal>

		<!-- Add-on Cancel Confirmation Modal -->
		<EModal v-model="showAddonCancel">
			<div class="flex items-start gap-4">
				<div class="w-10 h-10 rounded-full bg-destructive/10 dark:bg-destructive/30 flex items-center justify-center">
					<EIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-destructive" />
				</div>
				<div class="flex-1">
					<h3 class="text-lg font-semibold text-foreground">Remove this add-on?</h3>
					<p class="text-sm text-muted-foreground mt-2">
						It's removed from your subscription right away and won't appear on your next invoice.
						You can re-add it anytime.
					</p>
					<div class="flex items-center gap-2 mt-6">
						<EButton color="red" @click="handleCancelAddon">
							Remove Add-on
						</EButton>
						<EButton variant="ghost" @click="addonToCancel = null">
							Keep It
						</EButton>
					</div>
				</div>
			</div>
		</EModal>
	</div>
</template>
