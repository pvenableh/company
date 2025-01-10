import { logger } from '../../../utils/logger';
import sgMail from '@sendgrid/mail';

export default defineEventHandler(async (event) => {
	try {
		const body = await readBody(event);

		// Validate required data
		if (!body || !body.invoices || !Array.isArray(body.invoices)) {
			throw createError({
				statusCode: 400,
				message: 'Invalid request: invoices array is required',
			});
		}

		logger.info('Invoice notification initiated', {
			invoiceCount: body.invoices.length,
			organization: body.invoices[0]?.bill_to?.name,
		});

		sgMail.setApiKey('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');

		// Format monetary values
		const formatAmount = (amount) => {
			if (typeof amount === 'number' || typeof amount === 'string') {
				return new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: 'USD',
				}).format(parseFloat(amount));
			}
			return amount;
		};

		// Format dates
		const formatDate = (date) => {
			return new Date(date).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			});
		};

		// Group invoices by organization
		const groupedInvoices = body.invoices.reduce((acc, invoice) => {
			const orgId = invoice.bill_to.id;
			if (!acc[orgId]) {
				acc[orgId] = {
					organization: invoice.bill_to,
					invoices: [],
				};
			}
			acc[orgId].invoices.push(invoice);
			return acc;
		}, {});

		// Send emails for each organization
		const emailPromises = Object.values(groupedInvoices).map(async ({ organization, invoices }) => {
			// Format invoice data for template
			const formattedInvoices = invoices.map((invoice) => ({
				id: invoice.id,
				invoice_code: invoice.invoice_code,
				invoice_date: formatDate(invoice.invoice_date),
				due_date: formatDate(invoice.due_date),
				status: invoice.status,
				total_amount: formatAmount(invoice.total_amount),
			}));

			const totalAmount = invoices.reduce((sum, inv) => sum + parseFloat(inv.total_amount), 0);

			const message = {
				personalizations: [
					{
						to: [{ email: organization.email }],
						bcc: [{ email: 'huestudios.com@gmail.com' }],
					},
				],
				from: {
					email: 'mail@huestudios.company',
					name: 'hue: company',
				},
				template_id: 'd-fc7fc838e55e41ebbf64aac386092efd',
				replyTo: {
					email: 'contact@huestudios.com',
					name: 'hue',
				},
				subject: 'Invoice Notice from huestudios.company',
				content: [
					{
						type: 'text/html',
						value: '&nbsp;',
					},
				],
				dynamicTemplateData: {
					organization_name: organization.name,
					organization_address: organization.address,
					invoices: formattedInvoices,
					total_amount: formatAmount(totalAmount),
					invoice_count: invoices.length,
					email_date: formatDate(new Date()),
				},
				categories: ['hue', 'invoices'],
			};

			try {
				console.log('Sending invoice email with data:', {
					recipient: organization.email,
					invoiceCount: invoices.length,
					totalAmount: formatAmount(totalAmount),
				});

				const response = await sgMail.send(message);

				logger.info('Invoice email sent successfully', {
					organization: organization.name,
					email: organization.email,
					invoiceCount: invoices.length,
				});

				return {
					organization: organization.name,
					status: 'success',
					email: organization.email,
				};
			} catch (error) {
				logger.error('Failed to send invoice email', {
					organization: organization.name,
					email: organization.email,
					error: error.message,
				});

				return {
					organization: organization.name,
					status: 'failed',
					email: organization.email,
					error: error.message,
				};
			}
		});

		const results = await Promise.all(emailPromises);
		const failedCount = results.filter((r) => r.status === 'failed').length;
		const successCount = results.filter((r) => r.status === 'success').length;

		return {
			statusCode: 200,
			body: {
				message: `Sent ${successCount} invoice emails successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
				results,
			},
		};
	} catch (error) {
		logger.error('Invoice email process failed', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to process invoice emails',
		});
	}
});
