<template>
	<div class="relative w-full flex items-center justify-center flex-col page payment">
		<div class="flex items-center justify-center flex-col page__body">
			<h1 class="w-full mt-6 uppercase tracking-wider max-w-xl border-b-2 pb-2 mb-4">Payment</h1>
			<transition :name="animateName" mode="out-in" class="relative transition-container">
				<div class="w-full flex items-center justify-center flex-col max-w-xl payment-section">
					<div class="w-full max-w-xl payment__nav">
						<div
							@click.prevent="changePanel('card', 1)"
							class="payment__nav-item justify-start"
							:class="{ active: panel === 'card' }"
						>
							<h5>Credit Card</h5>
						</div>
						<div
							@click.prevent="changePanel('bank', 2)"
							class="payment__nav-item justify-center"
							:class="{ active: panel === 'bank' }"
						>
							<h5>Bank Account</h5>
						</div>
					</div>

					<div class="payment__container">
						<transition :name="animateName" mode="out-in" class="relative transition-container">
							<PaymentStripeCard
								v-if="panel === 'card'"
								key="1"
								paymentType="card"
								class="payment__panel"
								:amount="1000"
								:email="email"
							/>
							<PaymentStripeCard
								v-else-if="panel === 'bank'"
								paymentType="us_bank_account"
								class="payment__panel"
								:amount="1000"
								:email="email"
							/>
						</transition>
					</div>
				</div>
			</transition>
		</div>
	</div>
</template>

<script setup>
const name = ref('');
const address = ref('');
const email = ref('peter@huestudios.com');
const section = ref('one');
const panel = ref('card');
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
const service = ref({});
const payment = ref({});
const total = ref(0);
// const tax = ref(1.0 + page.tax);

// function selectService(option) {
// 	if (!name.value || !address.value || !email.value) {
// 		// toast.error("You need to complete the form.")
// 		return;
// 	} else {
// 		total.value = parseFloat(option.amount * 1.06625).toFixed(2);
// 		//(Math.floor(number) / 100).toFixed(2).replace(".", "")
// 		payment.value = {
// 			name: name.value,
// 			address: address.value,
// 			email: email.value,
// 			amount: total.value,
// 			description: option.description,
// 			title: option.title,
// 			id: option.id,
// 			stripeAmount: total.value.replace('.', ''),
// 		};
// 		localStorage.setItem('payment', JSON.stringify(payment.value));
// 		service.value = option;
// 		animateName.value = 'slide-left';
// 		section.value = 'two';
// 	}
// }
// function changeService() {
// 	section.value = 'one';
// 	animateName.value = 'slide-right';
// }
</script>
<style scoped>
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

		.payment__nav-item:nth-of-type(1):hover::after,
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
		}
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
		@apply w-full max-w-xl;
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
