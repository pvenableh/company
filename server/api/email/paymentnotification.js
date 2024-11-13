import sgMail from '@sendgrid/mail';

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	sgMail.setApiKey(process.env.SENDGRID_API_KEY);

	// Transform email array into recipient objects
	const formatRecipients = (emails) => {
		if (!emails) return [];
		// Handle both string and array inputs
		const emailArray = Array.isArray(emails) ? emails : [emails];
		return emailArray.map((email) => ({ email: email.trim() }));
	};

	const message = {
		personalizations: [
			{
				to: formatRecipients(body.emails || body.email), // Handle both single email and array
				bcc: [
					{
						email: 'huestudios.com@gmail.com',
					},
				],
			},
		],
		from: {
			email: 'mail@huestudios.company',
			name: 'hue: company',
		},
		template_id: 'd-838d5fc9a36a422bb6d8ecef57c8f5d6',
		replyTo: {
			email: 'contact@huestudios.com',
			name: 'hue',
		},
		subject: 'Payment Received on huestudios.company',
		content: [
			{
				type: 'text/html',
				value: '&nbsp;',
			},
		],
		dynamicTemplateData: {
			first_name: body.first_name,
			company: body.company,
			amount: body.amount,
			invoice: body.invoice,
			id: body.id,
		},
		categories: ['hue'],
	};

	try {
		const response = await sgMail.send(message);
		return {
			statusCode: 200,
			body: {
				message: 'Emails sent successfully',
				recipients: message.personalizations[0].to,
			},
		};
	} catch (error) {
		console.error('SendGrid Error:', error);
		if (error.response) {
			console.error('Error body:', error.response.body);
		}

		return {
			statusCode: error.code || 500,
			body: {
				message: 'Failed to send emails',
				error: error.message,
			},
		};
	}
});
