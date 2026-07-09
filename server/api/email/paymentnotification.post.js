import { readItem } from '@directus/sdk';
import sgMail from '@sendgrid/mail';
import { resolveMonitoringBcc } from '~~/server/utils/email-send';
import { evaluateMoneyGate } from '~~/server/utils/outbound-gate';
import { persistHeldEmail } from '~~/server/utils/held-email';

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	console.log('Payment notification received', { emails: body.emails });

	sgMail.setApiKey(process.env.SENDGRID_API_KEY);

	// Resolve the owning org from the invoice id (body.id) so the send can be
	// per-org BCC'd and attributed to the org in /email/activity. Fail-soft.
	let orgId = null;
	if (body.id) {
		try {
			const inv = await getServerDirectus().request(
				readItem('invoices', body.id, { fields: ['bill_to'] }),
			);
			orgId = inv && typeof inv.bill_to === 'object' ? inv.bill_to?.id ?? null : inv?.bill_to ?? null;
		} catch {
			// no org attribution — still sends, just untagged to an org
		}
	}

	const formatRecipients = (emails) => {
		if (!emails) return [];
		const emailArray = Array.isArray(emails) ? emails : [emails];
		return emailArray.map((email) => ({ email: email.trim() }));
	};

	// Format amount to proper currency string if it isn't already
	const formatAmount = (amount) => {
		if (typeof amount === 'number') {
			return new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency: 'USD',
			}).format(amount);
		}
		return amount;
	};

	// Format company name from bill_to object
	const formatCompany = (billTo) => {
		if (typeof billTo === 'object' && billTo.name) {
			return billTo.name;
		}
		return billTo || 'Not specified';
	};

	// Monitoring BCC = global SENDGRID_BCC_EMAIL + the org's optional email_bcc,
	// excluding the recipients. Both optional — no BCC if neither is set.
	const toEmails = (Array.isArray(body.emails) ? body.emails : [body.emails || body.email]).filter(Boolean);
	const bccList = await resolveMonitoringBcc({ orgId, exclude: toEmails });

	const personalization = {
		to: formatRecipients(body.emails || body.email),
	};
	if (bccList.length > 0) {
		personalization.bcc = bccList.map((email) => ({ email }));
	}

	const message = {
		personalizations: [personalization],
		from: {
			email: 'hello@earnest.guru',
			name: 'Earnest',
		},
		template_id: 'd-838d5fc9a36a422bb6d8ecef57c8f5d6',
		replyTo: {
			email: 'hello@earnest.guru',
			name: 'Earnest',
		},
		subject: 'Payment Received — Earnest',
		content: [
			{
				type: 'text/html',
				value: '&nbsp;',
			},
		],
		dynamicTemplateData: {
			first_name: body.first_name || '',
			company: formatCompany(body.company),
			amount: formatAmount(body.amount),
			invoice: body.invoice || 'Not specified',
			id: body.id || 'Not specified',
			payment_date: new Date().toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			}),
			// Add any additional template variables you need
			payment_method: body.payment_method || 'Not specified',
			receipt_url: body.receipt_url || null,
		},
		// Tagged as an Earnest send so the SendGrid webhook keeps the events and
		// (when the invoice resolved an org) attributes them in /email/activity.
		categories: ['earnest', 'payment'],
		customArgs: {
			app: 'earnest',
			email_name: 'payment-notification',
			send_collection: 'invoices',
			...(body.id ? { send_id: String(body.id) } : {}),
			...(orgId ? { organization: String(orgId) } : {}),
		},
	};

	// MONEY GATE (default-off) — when OUTBOUND_EMAIL_GATE_MONEY is enabled, only
	// money-allow-listed orgs actually transmit; others are held as a draft.
	const moneyGate = evaluateMoneyGate(orgId);
	if (!moneyGate.allowed) {
		console.log('[payment-notification] held as draft (money gate):', moneyGate.reason);
		// Persist to the draft outbox so it can be reviewed / flushed later.
		const draftId = await persistHeldEmail({
			organization: orgId,
			channel: 'payment_notification',
			to: message.personalizations[0].to?.[0]?.email ?? null,
			subject: message.subject,
			amount: body.amount,
			reason: moneyGate.reason,
			message,
			sourceCollection: 'invoices',
			sourceId: body.id ?? null,
		});
		return {
			statusCode: 200,
			body: {
				message: 'Payment notification held as draft (not sent)',
				held: true,
				reason: moneyGate.reason,
				recipients: message.personalizations[0].to,
				draftId,
			},
		};
	}

	try {
		console.log('Sending email with data:', {
			recipients: message.personalizations[0].to,
			templateData: message.dynamicTemplateData,
		});

		const response = await sgMail.send(message);

		console.log('Payment notification sent successfully', {
			recipients: message.personalizations[0].to,
		});
		return {
			statusCode: 200,
			body: {
				message: 'Emails sent successfully',
				recipients: message.personalizations[0].to,
			},
		};
	} catch (error) {
		console.error('Payment notification failed', error);
		throw createError({
			statusCode: error.code || 500,
			message: error.message,
		});
	}
});
