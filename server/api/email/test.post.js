// server/api/email/test.post.js
import sgMail from '@sendgrid/mail';

export default defineEventHandler(async (event) => {
	const config = useRuntimeConfig();
	sgMail.setApiKey(config.sendgridApiKey);

	try {
		await sgMail.send({
			to: 'huestudios.com@gmail.com',
			from: 'mail@huestudios.company',
			subject: 'SendGrid Test',
			text: 'This is a test email to verify SendGrid configuration',
		});

		return {
			statusCode: 200,
			body: { message: 'Test email sent successfully' },
		};
	} catch (error) {
		console.error('SendGrid Test Error:', error);
		if (error.response) {
			console.error('Error body:', error.response.body);
		}

		throw createError({
			statusCode: error.code || 500,
			statusMessage: 'Failed to send test email',
			message: error.message,
		});
	}
});
