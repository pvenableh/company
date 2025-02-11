// server/api/webhook/stripe.post.js
import Stripe from 'stripe';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const stripe = new Stripe(config.stripeSecret);

	try {
		const rawBody = await readRawBody(event);
		const signature = getHeader(event, 'stripe-signature');

		// Verify webhook signature
		let stripeEvent;
		try {
			stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
		} catch (err) {
			console.error('⚠️ Webhook signature verification failed:', err.message);
			throw createError({
				statusCode: 400,
				message: `Webhook Error: ${err.message}`,
			});
		}

		// Handle the event
		const paymentIntent = stripeEvent.data.object;
		const invoiceId = paymentIntent.metadata.invoice_id;

		if (!invoiceId) {
			console.error('No invoice ID found in payment intent metadata');
			throw createError({
				statusCode: 400,
				message: 'No invoice ID found in payment intent metadata',
			});
		}

		// Get charge details if available
		let charge = null;
		if (paymentIntent.latest_charge) {
			charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
		}

		// Prepare payments_received data
		const paymentData = {
			payment_intent: paymentIntent.id,
			stripe_status: paymentIntent.status,
			amount: paymentIntent.amount / 100,
			invoice_id: invoiceId,
			payment_method: charge?.payment_method_details?.type || paymentIntent.payment_method_types[0],
			date_updated: new Date().toISOString(),
		};

		if (charge) {
			paymentData.charge_id = charge.id;
			paymentData.receipt_url = charge.receipt_url;
		}

		// Update status based on event type
		switch (stripeEvent.type) {
			case 'payment_intent.succeeded':
				paymentData.status = 'paid';
				break;

			case 'payment_intent.payment_failed':
				paymentData.status = 'failed';
				paymentData.error_message = paymentIntent.last_payment_error?.message;
				break;

			case 'payment_intent.processing':
				paymentData.status = 'processing';
				break;

			default:
				console.log(`Unhandled event type: ${stripeEvent.type}`);
				return { received: true };
		}

		// Update or create payments_received record and update invoice
		const { directus } = useDirectusAuth();

		try {
			// First check if a payment record exists
			const existingPayments = await directus.request(
				readItems('payments_received', {
					filter: {
						payment_intent: { _eq: paymentIntent.id },
					},
				}),
			);

			if (existingPayments.length > 0) {
				// Update existing payment record
				await directus.request(updateItem('payments_received', existingPayments[0].id, paymentData));
			} else {
				// Create new payment record
				await directus.request(
					createItem('payments_received', {
						...paymentData,
						date_received: new Date().toISOString(),
					}),
				);
			}

			// Update invoice status
			await directus.request(
				updateItem('invoices', invoiceId, {
					status: paymentData.status,
					date_updated: new Date().toISOString(),
				}),
			);

			console.log(`Successfully processed ${stripeEvent.type} for invoice ${invoiceId}`);

			return {
				received: true,
				status: 'success',
				invoiceId,
				eventType: stripeEvent.type,
				paymentStatus: paymentData.status,
			};
		} catch (error) {
			console.error('Error updating Directus records:', error);
			throw createError({
				statusCode: 500,
				message: 'Error updating payment records in Directus',
			});
		}
	} catch (err) {
		console.error('Webhook error:', err);
		throw createError({
			statusCode: 500,
			message: `Webhook Error: ${err.message}`,
		});
	}
});
