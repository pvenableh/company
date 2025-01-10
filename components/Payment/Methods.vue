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

const stripeFee = computed(() => {
	if (panel.value === 'bank') return '0.00';
	return (props.amount * 0.029 + 0.3).toFixed(2);
});

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

if (process.client) {
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
			Please note, a credit card payment will add a 3% processing fee. Using a bank account for payment adds
			<strong>no fees</strong>
			.
		</p>
		<h5 class="uppercase tracking-wide mb-6">
			<span class="opacity-50">Total:</span>
			${{ formatNumber(totalWithFees) }}
			<span v-if="panel === 'card'" class="text-[9px] uppercase">Includes a ${{ stripeFee }} Processing fee.</span>
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
.payment {
	.details {
		font-size: 10px;
		@apply uppercase font-bold;
	}
	.services {
		&__title {
			font-size: 12px;
		}

		&__item {
			background: white;
			transition: 0.4s var(--curve);
			background: rgba(255, 255, 255, 0.25);
			backdrop-filter: blur(10px);
		}
		&__item:hover {
			background: var(--darkGrey);
			color: var(--white);
			opacity: 1;
		}
		.services__item.selected {
			background: var(--darkGrey);
			color: var(--white);
			opacity: 1;
		}
	}

	&__nav {
		@apply flex flex-row justify-around items-center;

		&-item {
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

	&__container {
		@apply flex flex-col justify-center items-center w-full max-w-xl overflow-hidden;

		@media (min-width: theme('screens.md')) {
		}

		@media (min-width: theme('screens.md')) {
		}
	}

	.transition-container {
		@apply max-w-xl;
	}

	&__panel {
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
