// server/api/paymentnotification.ts
import sendgrid from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

if (!SENDGRID_API_KEY) {
	throw new Error('SENDGRID_API_KEY environment variable is not set');
}

sendgrid.setApiKey(SENDGRID_API_KEY);

const formatAmount = (amount) => {
	// Convert to number if it's a string
	const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

	// Divide by 100 to move decimal point and format to 2 decimal places
	return (numericAmount / 100).toFixed(2);
};

export default defineEventHandler(async (event) => {
	try {
		const body = await readBody(event);

		// Validate required fields
		const requiredFields = ['user', 'email', 'bill_to', 'id', 'amount', 'invoice'];
		for (const field of requiredFields) {
			if (!body[field]) {
				throw createError({
					statusCode: 400,
					message: `Missing required field: ${field}`,
				});
			}
		}

		// Create array of unique email recipients
		const emailRecipients = new Set([body.email]);

		// If user.email exists and is different from body.email, add it
		if (body.user?.email && body.user.email !== body.email) {
			emailRecipients.add(body.user.email);
		}

		// Convert Set to array of recipient objects
		const recipients = Array.from(emailRecipients).map((email) => ({ email }));

		const formattedAmount = formatAmount(body.amount);

		const message = {
			personalizations: [
				{
					to: recipients,
					bcc: [
						{
							email: process.env.BCC_EMAIL || 'huestudios.com@gmail.com',
						},
					],
				},
			],
			from: {
				email: process.env.FROM_EMAIL || 'mail@huestudios.company',
				name: 'hue: company',
			},
			template_id: process.env.TEMPLATE_ID || 'd-838d5fc9a36a422bb6d8ecef57c8f5d6',
			replyTo: {
				email: process.env.REPLY_TO_EMAIL || 'contact@huestudios.com',
				name: 'hue: company',
			},
			subject: 'Payment Received on huestudios.company',
			content: [
				{
					type: 'text/html',
					value: '&nbsp;',
				},
			],
			dynamicTemplateData: {
				user: body.user,
				email: body.email,
				name: body.bill_to,
				id: body.id,
				amount: formattedAmount,
				invoice: body.invoice,
			},
			categories: ['hue'],
		};

		// Log recipients for debugging
		console.log('Sending email to recipients:', recipients);

		const response = await sendgrid.send(message);

		return {
			statusCode: response[0].statusCode,
			message: 'Email sent successfully',
			recipients: Array.from(emailRecipients),
		};
	} catch (error) {
		console.error('SendGrid Error:', error);

		// Handle SendGrid specific errors
		if (error.response) {
			throw createError({
				statusCode: error.code || 500,
				message: error.message || 'Failed to send email',
			});
		}

		// Handle other errors
		throw createError({
			statusCode: 500,
			message: 'Internal server error',
		});
	}
});
