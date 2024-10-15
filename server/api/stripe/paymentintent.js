import Stripe from 'stripe';

export default defineEventHandler(async (event) => {
	const query = getQuery(event);
	let total = query.amount;
	console.log(query.amount);
	let paymentType = query.paymentType;
	let email = query.email;
	// let customerId = query.customer
	let options;
	if (paymentType) {
		if (paymentType === 'card') {
			options = {
				amount: total,
				currency: 'usd',
				// customer: customerId,
				payment_method_types: ['card', 'link'],
				receipt_email: email,
				// setup_future_usage: 'on_session',

				statement_descriptor: 'Payment to hue.',
			};
		} else {
			options = {
				amount: total,
				currency: 'usd',
				// customer: customerId,
				payment_method_types: [paymentType],
				receipt_email: email,
				// setup_future_usage: 'on_session',

				statement_descriptor: 'Payment to hue.',
			};
		}
	} else {
		options = {
			amount: total,
			currency: 'usd',
			// customer: customerId,
			receipt_email: email,
			// setup_future_usage: 'on_session',
			automatic_payment_methods: {
				enabled: true,
			},
			statement_descriptor: 'Payment to hue.',
		};
	}

	const stripe = new Stripe('sk_test_MEBnHMrFHTpPJsl88qX92GbI00wdGnFKSm');
	// hue sk_test_MEBnHMrFHTpPJsl88qX92GbI00wdGnFKSm
	// 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

	const paymentIntent = await stripe.paymentIntents.create(options);

	return paymentIntent;
});
