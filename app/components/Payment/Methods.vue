<script setup>
const props = defineProps({
	email: {
		type: String,
		default: null,
	},
	bill_to: {
		type: Object,
		default: () => null,
	},
	amount: {
		type: [Number],
		default: 0,
	},
	user: {
		type: Object,
		default: () => null,
	},
	invoice: {
		type: Object,
		default: () => null,
	},
	isAnonymous: {
		type: Boolean,
		default: false,
	},
});

const email = ref('');

if (props.email) {
	email.value = props.email;
} else if (props.user?.email) {
	email.value = props.user.email;
} else if (props.invoice?.billing_email) {
	email.value = props.invoice.billing_email;
} else if (props.bill_to?.email) {
	email.value = props.bill_to.email;
}

const panel = ref('bank');
const previousPanelKey = ref(1);
const animateName = ref('slide-right');
function changePanel(newPanel, key) {
	if (previousPanelKey.value < key) {
		animateName.value = 'slide-left';
	} else {
		animateName.value = 'slide-right';
	}
	previousPanelKey.value = key;
	panel.value = newPanel;
}

// Stripe US pricing. Card = 2.9% + $0.30; ACH = 0.8% capped at $5.00. Stripe
// takes its cut from the TOTAL captured (not the invoice base), so passing the
// fee on means GROSSING UP — total = (base + fixed) / (1 - pct) — otherwise the
// org under-collects by the fee-on-the-fee. The itemized fee shown is total-base.
const CARD_PCT = 0.029;
const CARD_FIXED = 0.3;
const ACH_PCT = 0.008;
const ACH_CAP = 5.0;

// Per-org policy (merchant org = invoice.bill_to). Defaults preserve prior
// behavior: card fee IS passed to the payer, ACH fee is NOT (bank stays free).
const passCardFee = computed(() => props.bill_to?.pass_card_fee !== false);
const passAchFee = computed(() => props.bill_to?.pass_ach_fee === true);

const stripeFee = computed(() => {
	const base = Number(props.amount) || 0;
	if (panel.value === 'bank') {
		if (!passAchFee.value) return '0.00';
		// Gross up ACH, then clamp at the flat $5 cap (above ~$620 Stripe charges
		// the cap regardless, so the fee never exceeds it).
		const uncapped = (base * ACH_PCT) / (1 - ACH_PCT);
		return Math.min(uncapped, ACH_CAP).toFixed(2);
	}
	if (!passCardFee.value) return '0.00';
	const total = (base + CARD_FIXED) / (1 - CARD_PCT);
	return (total - base).toFixed(2);
});

// Payer-facing fee disclosure, adapted to the org's policy for each method.
const feeDisclosure = computed(() => {
	const card = passCardFee.value
		? 'Credit card payments add a processing fee (2.9% + $0.30).'
		: 'Credit card payments add no fee.';
	const bank = passAchFee.value
		? 'Bank payments add a smaller fee (0.8%, max $5).'
		: 'Paying by bank adds no fees.';
	return `${card} ${bank}`;
});

const hasFee = computed(() => Number(stripeFee.value) > 0);
const feeMethodLabel = computed(() => (panel.value === 'bank' ? 'ACH' : 'Processing'));

const totalWithFees = computed(() => {
	return (Number(props.amount) + Number(stripeFee.value)).toFixed(2);
});

function formatForStripe(amount) {
	// Convert to a string and remove the decimal point
	return Math.round(amount * 100);
}
const total = computed(() => {
	return formatForStripe(totalWithFees.value);
});

const payment = ref({});

payment.value = {
	user: props.user,
	bill_to: props.bill_to,
	emails: props.bill_to?.emails,
	email: email.value,
	amount: total.value,
	invoice_code: props.invoice.invoice_code,
	invoice_id: props.invoice.id,
	stripeAmount: total.value,
	isAnonymous: props.isAnonymous,
};

if (import.meta.client) {
	localStorage.setItem('payment', JSON.stringify(payment.value));
}

const formatNumber = (value) => {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
};
</script>
<template>
	<div class="w-full flex flex-col payment">
		<h1 class="w-full mt-6 lg:mt-0 uppercase tracking-wider">Payment</h1>
		<p class="mt-2 mb-6 text-[12px]">
			{{ feeDisclosure }}
		</p>
		<h5 class="uppercase tracking-wide mb-6">
			<span class="opacity-50">Total:</span>
			${{ formatNumber(totalWithFees) }}
			<span v-if="hasFee" class="text-[9px] uppercase">Includes a ${{ stripeFee }} {{ feeMethodLabel }} fee.</span>
		</h5>
		<transition :name="animateName" mode="out-in" class="relative transition-container">
			<div class="w-full flex items-center justify-center flex-col payment-section">
				<div class="w-full payment__nav">
					<div
						@click.prevent="changePanel('bank', 1)"
						class="payment__nav-item justify-center"
						:class="{ active: panel === 'bank' }"
					>
						<h5>Bank Account</h5>
					</div>
					<div
						@click.prevent="changePanel('card', 2)"
						class="payment__nav-item justify-center"
						:class="{ active: panel === 'card' }"
					>
						<h5>Credit Card</h5>
					</div>
				</div>

				<div class="payment__container">
					<transition :name="animateName" mode="out-in" class="relative transition-container">
						<PaymentStripeCard
							v-if="panel === 'bank'"
							key="1"
							paymentType="us_bank_account"
							class="payment__panel"
							:amount="total"
							:email="email"
							:invoice="invoice"
						/>
						<PaymentStripeCard
							v-else-if="panel === 'card'"
							key="2"
							paymentType="card"
							class="payment__panel"
							:amount="total"
							:email="email"
							:invoice="invoice"
						/>
					</transition>
				</div>
			</div>
		</transition>
	</div>
</template>
<style>
@reference "~/assets/css/tailwind.css";
.payment {
	.details {
		font-size: 10px;
		@apply uppercase font-bold;
	}
	.services__title {
		font-size: 12px;
	}

	.services__item {
		background: white;
		transition: 0.4s var(--curve);
		background: rgba(255, 255, 255, 0.25);
		backdrop-filter: blur(10px);
	}
	.services__item:hover {
		background: var(--darkGrey);
		color: var(--white);
		opacity: 1;
	}
	.services__item.selected {
		background: var(--darkGrey);
		color: var(--white);
		opacity: 1;
	}

	.payment__nav {
		@apply flex flex-row justify-around items-center;

		.payment__nav-item {
			opacity: 0.5;
			transition: all 0.3s var(--curve);

			@apply tracking-wider uppercase cursor-pointer mb-2 w-1/2 flex items-center relative;

			h5 {
				width: 80%;
				font-size: 10px;
				@apply text-center;
			}
		}

		.payment__nav-item::after {
			content: '';
			display: block;
			width: 0%;
			height: 1px;
			bottom: -5px;
			left: 50%;
			background: var(--grey);
			transition: all 0.3s var(--curve);
			transform-origin: center;
			@apply absolute;
		}

		.payment__nav-item.active {
			opacity: 1;
		}

		.payment__nav-item:hover {
			opacity: 1;
		}

		.payment__nav-item:hover::after,
		.payment__nav-item.active::after {
			width: 80%;
			left: 10%;
		}

		/* .payment__nav-item:nth-of-type(1):hover::after,
		.payment__nav-item:nth-of-type(1).active::after {
			width: 80%;
			left: 0%;
		}

		.payment__nav-item:nth-of-type(2):hover::after,
		.payment__nav-item:nth-of-type(2).active::after {
			width: 80%;
			left: 10%;
		}

		.payment__nav-item:nth-of-type(3):hover::after,
		.payment__nav-item:nth-of-type(3).active::after {
			width: 80%;
			left: 20%;
		} */
	}

	.payment__container {
		@apply flex flex-col justify-center items-center w-full max-w-xl overflow-hidden;

		@media (min-width: theme('screens.md')) {
		}

		@media (min-width: theme('screens.md')) {
		}
	}

	.transition-container {
		@apply max-w-xl;
	}

	.payment__panel {
		@apply w-full;
	}

	.change-btn {
		font-size: 0.75rem;
		line-height: 1rem;
		font-weight: 900;
		@apply inline-block tracking-wider;

		svg {
			transition: 0.4s var(--curve);
			margin-top: -2px;
			height: 12px;
			display: inline-block !important;

			path {
				stroke-width: 10px;
				stroke: var(--darkGrey) !important;
			}
		}
	}

	.change-btn:hover {
		svg {
			transform: translateX(10px);
		}
	}
}
</style>
