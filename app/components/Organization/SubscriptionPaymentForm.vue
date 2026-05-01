<script setup lang="ts">
import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js'

const props = defineProps<{
	clientSecret: string
	email: string
	priceLabel: string
}>()

const emit = defineEmits<{
	(e: 'success'): void
	(e: 'error', message: string): void
}>()

const config = useRuntimeConfig()

const isElementLoading = ref(true)
const isElementReady = ref(false)
const isSubmitting = ref(false)
const errorMsg = ref<string | null>(null)

let stripe: Stripe | null = null
let elements: StripeElements | null = null

async function setupElements() {
	try {
		stripe = await loadStripe(config.public.stripePublic as string)
		if (!stripe) throw new Error('Failed to load Stripe')

		elements = stripe.elements({
			clientSecret: props.clientSecret,
			appearance: {
				theme: 'stripe',
				variables: {
					colorPrimary: '#06b6d4',
					colorBackground: '#ffffff',
					colorText: '#0f172a',
					colorDanger: '#ef4444',
					fontFamily: 'system-ui, -apple-system, sans-serif',
					borderRadius: '8px',
					fontSizeBase: '14px',
				},
				rules: {
					'.Label': {
						fontSize: '12px',
						fontWeight: '500',
						color: '#475569',
					},
				},
			},
			fields: {
				billingDetails: {
					email: 'never',
				},
			},
		})

		const paymentElement = elements.create('payment', {
			layout: 'tabs',
		})

		paymentElement.on('ready', () => {
			isElementReady.value = true
			isElementLoading.value = false
		})

		paymentElement.on('change', (event: any) => {
			if (event.error) {
				errorMsg.value = event.error.message
			} else {
				errorMsg.value = null
			}
		})

		paymentElement.mount('#wizard-payment-element')
	} catch (err: any) {
		isElementLoading.value = false
		const msg = err?.message || 'Failed to set up payment form'
		errorMsg.value = msg
		emit('error', msg)
	}
}

async function handleSubmit() {
	if (!stripe || !elements) {
		errorMsg.value = 'Payment form not ready'
		return
	}
	if (isSubmitting.value) return

	isSubmitting.value = true
	errorMsg.value = null

	try {
		const { error, paymentIntent } = await stripe.confirmPayment({
			elements,
			confirmParams: {
				// SCA / 3DS challenges that need redirect will use this URL.
				// On a successful no-redirect confirm, paymentIntent is returned.
				return_url: `${window.location.origin}/organization/new?step=invite&checkout=ok`,
				payment_method_data: {
					billing_details: { email: props.email },
				},
			},
			redirect: 'if_required',
		})

		if (error) {
			throw error
		}

		if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
			emit('success')
		} else if (paymentIntent) {
			// Unexpected non-terminal status — surface it.
			throw new Error(`Payment ${paymentIntent.status}. Please try again.`)
		}
	} catch (err: any) {
		const msg = err?.message || 'Payment failed'
		errorMsg.value = msg
		emit('error', msg)
		isSubmitting.value = false
	}
}

onMounted(() => {
	setupElements()
})

onBeforeUnmount(() => {
	if (elements) {
		try { elements.getElement('payment')?.destroy() } catch {}
	}
})

defineExpose({
	submit: handleSubmit,
	isSubmitting,
	isElementReady,
})
</script>

<template>
	<div>
		<div v-if="errorMsg" class="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
			{{ errorMsg }}
		</div>

		<div v-if="isElementLoading" class="py-8 text-center text-sm text-muted-foreground">
			<Icon name="lucide:loader-2" class="w-5 h-5 animate-spin inline mr-2" />
			Loading secure payment form...
		</div>

		<div v-show="!isElementLoading">
			<div id="wizard-payment-element" />

			<p v-if="isElementReady" class="mt-3 text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
				<Icon name="lucide:lock" class="w-3 h-3" />
				Secure payment processed by Stripe
			</p>
		</div>
	</div>
</template>
