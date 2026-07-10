// server/api/early-access/welcome.post.ts
/**
 * Webhook endpoint that sends the early-access welcome email.
 *
 * Trigger chain:
 *   Marketing site early-access form
 *     → POST admin.earnest.guru/flows/trigger/<EARLY_ACCESS_FLOW_ID>  (Directus Flow)
 *       → the Flow creates the `early_access` row
 *       → the Flow's "Webhook / Request URL" op POSTs here to send the welcome
 *
 * To wire the send step, add a "Webhook / Request URL" operation to the
 * early-access Flow (id 08912f2e-d3a7-4ea6-b21e-9bdb79feee64) AFTER the
 * create-item op:
 *     Method: POST
 *     URL:    https://app.earnest.guru/api/early-access/welcome
 *     Body:   { "email": "{{$trigger.body.email}}",
 *               "name":  "{{$trigger.body.name}}",
 *               "secret": "<EARLY_ACCESS_WEBHOOK_SECRET>" }
 *
 * Request body:
 *   {
 *     email: string,     // recipient (required)
 *     name?: string,     // full name; first token used for the greeting
 *     secret: string,    // must equal EARLY_ACCESS_WEBHOOK_SECRET
 *   }
 *
 * Fails closed: if EARLY_ACCESS_WEBHOOK_SECRET is unset, every request is
 * rejected rather than exposing an open email-send endpoint to the internet.
 */

import { timingSafeEqual } from 'node:crypto';
import { sendEarlyAccessWelcomeEmail } from '~~/server/utils/early-access-email';

// Constant-time secret compare — `===` leaks length/prefix via timing.
function secretsMatch(a: string, b: string): boolean {
	const aBuf = Buffer.from(a);
	const bBuf = Buffer.from(b);
	if (aBuf.length !== bBuf.length) return false;
	return timingSafeEqual(aBuf, bBuf);
}

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig() as any;
	const webhookSecret = config.earlyAccessWebhookSecret as string;

	const body = await readBody(event);
	const { email, name, secret } = body || {};

	if (!webhookSecret || typeof secret !== 'string' || !secretsMatch(secret, webhookSecret)) {
		throw createError({ statusCode: 403, message: 'Invalid webhook secret' });
	}

	if (!email || typeof email !== 'string') {
		throw createError({ statusCode: 400, message: 'email is required' });
	}

	const res = await sendEarlyAccessWelcomeEmail({
		to: email.trim(),
		name: typeof name === 'string' ? name : null,
	});

	// 200 even on a non-fatal send failure so the Flow doesn't retry-storm on a
	// transient SendGrid hiccup; `ok` reflects whether the mail actually went.
	return { ok: res.sent, reason: res.reason };
});
