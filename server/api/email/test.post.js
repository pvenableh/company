// server/api/email/test.post.js
import sgMail from '@sendgrid/mail';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	const body = await readBody(event);

	const to = body?.to;
	const subject = body?.subject || 'Test Email from Earnest';
	const html = body?.html;

	if (!to) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Missing required field: to (recipient email address)',
		});
	}

	if (!html) {
		throw createError({
			statusCode: 400,
			statusMessage: 'Missing required field: html (email content)',
		});
	}

	const apiKey = config.sendgridApiKey || config.SENDGRID_API_KEY;
	if (!apiKey) {
		throw createError({
			statusCode: 500,
			statusMessage: 'SendGrid API key not configured',
		});
	}

	sgMail.setApiKey(apiKey);

	const fromEmail = config.sendgridFromEmail || config.FROM_EMAIL || 'mail@huestudios.company';
	const fromName = config.sendgridFromName || 'Earnest';

	try {
		await sgMail.send({
			to,
			from: {
				email: fromEmail,
				name: `[TEST] ${fromName}`,
			},
			subject: `[TEST] ${subject}`,
			html,
		});

		return {
			success: true,
			message: `Test email sent successfully to ${to}`,
		};
	} catch (error) {
		console.error('[email/test] SendGrid Error:', error.message);
		if (error.response) {
			console.error('[email/test] Error body:', error.response.body);
		}

		const sgErrors = error.response?.body?.errors;
		const errorDetail = sgErrors?.length
			? sgErrors.map((e) => e.message).join('; ')
			: error.message;

		throw createError({
			statusCode: error.code || 500,
			statusMessage: `Failed to send test email: ${errorDetail}`,
		});
	}
});
