<template>
  <div class="relative flex items-center justify-center flex-col px-6 pt-12 pb-24 min-h-screen">
    <h1 class="mb-6 uppercase text-center tracking-wider">
      Thank you.
    </h1>
    <div class="w-full uppercase text-center tracking-wider text-sm">
      <p v-for="(message, index) in messages" class="mb-4">{{ message }}</p>
    </div>

  </div>
</template>

<script setup>
const route = useRoute()
const config = useRuntimeConfig()
import { loadStripe } from '@stripe/stripe-js'
const { $directus, $preview } = useNuxtApp();
const messages = ref([])
const clientSecret = ref('')
clientSecret.value = route.query.payment_intent_client_secret
let stripe
import { useToast } from 'vue-toastification'
const toast = useToast()
function showMessage(messageText) {
  toast.error(messageText)
}
const payment = ref({})
onMounted(async () => {
  if (window.localStorage.getItem('payment')) {
    payment.value = JSON.parse(window.localStorage.getItem('payment'))
  } else {
    console.log('no payment')
  }
  stripe = await loadStripe(config.public.stripePublic)
  const { error, paymentIntent } = await stripe.retrievePaymentIntent(
    clientSecret.value, {
    expand: ['payment_method', 'latest_charge'],
  }
  )
  console.log(paymentIntent)
  switch (paymentIntent.status) {
    case 'succeeded':
      showMessage('Payment succeeded!')
      break
    case 'processing':
      showMessage('Your payment is processing.')
      break
    case 'requires_payment_method':
      showMessage('Your payment was not successful, please try again.')
      break
    default:
      showMessage('Something went wrong.')
      break
  }
  if (error) {
    messages.value.append(error.message)
  }
  messages.value.push(
    'Payment of $' +
    parseFloat(paymentIntent.amount * 0.01).toFixed(2) +
    ' ' +
    paymentIntent.status +
    '.'
  )

  // messages.value.push(paymentIntent)
  messages.value.push(
    `An email receipt was sent to ${paymentIntent.receipt_email}.`
  )
  let date = new Date();
  const newYorkTimezoneOffset = -240;
  const newDate = new Date(date.getTime() + (newYorkTimezoneOffset * 60 * 1000));
  await $directus.items('payments_received').createOne({
    status: 'published',
    name: payment.value.name,
    email: payment.value.email,
    address: payment.value.address,
    service: payment.value.id,
    date_received: newDate.toISOString(),
    payment_intent: paymentIntent.id,
    payment_total: payment.value.amount,
  });
  console.log(payment.value)
  const { data, pending, error2, refresh } = fetch('/api/paymentnotification', {
    method: 'post',
    body: {
      name: payment.value.name,
      email: payment.value.email,
      address: payment.value.address,
      title: payment.value.title,
      amount: payment.value.amount,
      description: payment.value.description,
    },
  })
  console.log(data)
  payment.value = {}
  localStorage.removeItem('payment')

})
</script>
