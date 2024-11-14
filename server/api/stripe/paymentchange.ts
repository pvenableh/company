// /server/api/stripe-webhook.ts
import { defineEventHandler, getHeader, readBody } from 'h3';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
	apiVersion: '2023-10-16',
});

export default defineEventHandler(async (event) => {
	try {
		// Read payload and signature
		const payload = await readBody(event);
		const signature = getHeader(event, 'stripe-signature') || '';

		// Use endpoint secret for verification
		const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
		let stripeEvent: Stripe.Event;

		// Verify and parse the event
		try {
			stripeEvent = stripe.webhooks.constructEvent(JSON.stringify(payload), signature, endpointSecret);
		} catch (err) {
			console.error('Stripe verification error:', err);
			return { statusCode: 400, message: 'Webhook verification failed' };
		}

		// Process specific Stripe events
		if (stripeEvent.type === 'payment_intent.succeeded') {
			const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;

			// Call Directus API to update records
			await updateDirectusRecords(paymentIntent);
		}

		return { statusCode: 200, message: 'Event received' };
	} catch (error) {
		console.error('Error handling webhook:', error);
		return { statusCode: 500, message: 'Server error' };
	}
});

async function updateDirectusRecords(paymentIntent: Stripe.PaymentIntent) {
	try {
		// Update Invoice collection in Directus
		await fetch(`https://admin.huestudios.company/items/invoices`, {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${process.env.DIRECTUS_SERVER_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				// your update payload based on paymentIntent data
			}),
		});

		// Update payments_received collection in Directus
		await fetch(`https://admin.huestudios.company/items/payments_received`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${process.env.DIRECTUS_SERVER_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				// your update payload based on paymentIntent data
			}),
		});
	} catch (error) {
		console.error('Error updating Directus records:', error);
	}
}
