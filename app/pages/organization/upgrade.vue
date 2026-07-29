<script setup lang="ts">
/**
 * Trial-expiry / upgrade lock screen.
 *
 * Reached when the trial-expiry gate (app/middleware/subscription.global.ts)
 * finds the org's `subscription_status` in a locked state — most commonly
 * `paused` (the 14-day no-card trial lapsed). The owner adds a card here: we
 * confirm a Stripe SetupIntent (no charge), then POST the resulting payment
 * method to /api/stripe/subscription/convert-trial, which resumes the paused
 * subscription. The webhook then flips the org back to `active` and the gate
 * clears. Uses the `blank` layout so the locked app chrome stays hidden.
 */
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';

definePageMeta({ layout: 'blank', middleware: ['auth'] });
useHead({ title: 'Add a card | Earnest' });

const config = useRuntimeConfig();
const { currentOrg, isInitialized, initializeOrganizations } = useOrganization();

const PLAN_LABEL: Record<string, string> = {
  solo: 'Solo', studio: 'Studio', agency: 'Agency', enterprise: 'Enterprise', free: 'your plan',
};

const loading = ref(true);
const ready = ref(false);
const submitting = ref(false);
const errorMsg = ref<string | null>(null);

// 'incomplete' orgs never picked a plan → send them to the plan picker instead.
const needsPlan = computed(() => currentOrg.value?.subscription_status === 'incomplete');
const planLabel = computed(() => PLAN_LABEL[(currentOrg.value as any)?.plan || 'free'] || 'your plan');

let stripe: Stripe | null = null;
let elements: StripeElements | null = null;

async function setupCard() {
  const org: any = currentOrg.value;
  const customerId = org?.stripe_customer_id;
  if (!customerId) {
    errorMsg.value = 'No billing profile found for this organization.';
    loading.value = false;
    return;
  }
  try {
    const { clientSecret } = await $fetch<{ clientSecret: string }>(
      '/api/stripe/subscription/setup-intent',
      { method: 'POST', body: { customerId } },
    );

    stripe = await loadStripe(config.public.stripePublic as string);
    if (!stripe) throw new Error('Failed to load Stripe');

    elements = stripe.elements({
      clientSecret,
      appearance: { theme: 'night', variables: { colorPrimary: '#06b6d4', borderRadius: '10px' } },
    });
    const paymentElement = elements.create('payment', { layout: 'tabs' });
    paymentElement.on('ready', () => { ready.value = true; loading.value = false; });
    paymentElement.on('change', (e: any) => { errorMsg.value = e.error?.message || null; });
    paymentElement.mount('#upgrade-payment-element');
  } catch (err: any) {
    errorMsg.value = err?.data?.message || err?.message || 'Could not load the payment form.';
    loading.value = false;
  }
}

async function handleSubmit() {
  if (!stripe || !elements || submitting.value) return;
  submitting.value = true;
  errorMsg.value = null;
  try {
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: `${window.location.origin}/` },
    });
    if (error) throw error;
    const paymentMethodId = typeof setupIntent?.payment_method === 'string'
      ? setupIntent.payment_method
      : (setupIntent?.payment_method as any)?.id;
    if (!paymentMethodId) throw new Error('No payment method was captured. Please try again.');

    await $fetch('/api/stripe/subscription/convert-trial', {
      method: 'POST',
      body: { organizationId: currentOrg.value?.id, paymentMethodId },
    });

    // Hard reload so every org-scoped composable re-reads the now-active status
    // and the trial-expiry gate clears cleanly.
    window.location.href = '/';
  } catch (err: any) {
    errorMsg.value = err?.data?.message || err?.message || 'Failed to add your card. Please try again.';
    submitting.value = false;
  }
}

onMounted(async () => {
  if (!isInitialized.value) {
    try { await initializeOrganizations(); } catch { /* fall through */ }
  }
  if (needsPlan.value) { loading.value = false; return; }
  await setupCard();
});
</script>

<template>
  <div class="min-h-dvh flex items-center justify-center p-6 bg-background text-foreground">
    <div class="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-xl">
      <div class="flex items-center gap-2 text-cyan-500 mb-4">
        <EIcon name="i-lucide-sparkles" class="w-5 h-5" />
        <span class="text-[11px] uppercase tracking-[0.18em] font-medium">Earnest</span>
      </div>

      <!-- Never chose a plan -->
      <template v-if="needsPlan">
        <h1 class="text-2xl font-semibold tracking-tight mb-2">Start your free trial</h1>
        <p class="text-sm text-muted-foreground mb-6">
          Pick a plan to start your 14-day free trial — no credit card required.
        </p>
        <NuxtLink
          to="/organization/new"
          class="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-foreground text-background font-medium px-4 py-2.5 hover:opacity-90"
        >
          Choose a plan
        </NuxtLink>
      </template>

      <!-- Trial ended / subscription lapsed -->
      <template v-else>
        <h1 class="text-2xl font-semibold tracking-tight mb-2">Your free trial has ended</h1>
        <p class="text-sm text-muted-foreground mb-6">
          Add a card to keep your <strong>{{ planLabel }}</strong> plan and pick up right where you left off. You’ll be billed for the plan you chose.
        </p>

        <div id="upgrade-payment-element" class="min-h-[44px] mb-3" />

        <div v-if="loading" class="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <EIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" /> Loading secure payment form…
        </div>

        <p v-if="errorMsg" class="text-sm text-red-500 mb-3">{{ errorMsg }}</p>

        <button
          type="button"
          class="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-foreground text-background font-medium px-4 py-2.5 hover:opacity-90 disabled:opacity-50"
          :disabled="!ready || submitting"
          @click="handleSubmit"
        >
          <EIcon v-if="submitting" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          <EIcon v-else name="i-lucide-credit-card" class="w-4 h-4" />
          {{ submitting ? 'Adding your card…' : 'Add card & continue' }}
        </button>

        <NuxtLink
          to="/account"
          class="block text-center text-xs text-muted-foreground hover:text-foreground mt-4"
        >
          Manage account
        </NuxtLink>
      </template>
    </div>
  </div>
</template>
