import { logger } from '../../utils/logger';
import sgMail from '@sendgrid/mail';

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	logger.info('Payment notification received', { emails: body.emails });

	sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

	const message = {
		personalizations: [
			{
				to: formatRecipients(body.emails || body.email),
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
		categories: ['hue'],
	};

	try {
		console.log('Sending email with data:', {
			recipients: message.personalizations[0].to,
			templateData: message.dynamicTemplateData,
		});

		const response = await sgMail.send(message);

		logger.info('Payment notification sent successfully', {
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
		logger.error('Payment notification failed', error);
		throw createError({
			statusCode: error.code || 500,
			message: error.message,
		});
	}
});
