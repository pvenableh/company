// server/api/invoices/send-emails.post.js
import { logger } from '../../utils/logger';
import sgMail from '@sendgrid/mail';

export default defineEventHandler(async (event) => {
	const body = await readBody(event);
	logger.info('Invoice email notification initiated', { invoicesCount: body.invoices.length });

	sgMail.setApiKey('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');

	// Format monetary values consistently
	const formatAmount = (amount) => {
		if (typeof amount === 'number' || typeof amount === 'string') {
			return new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency: 'USD',
			}).format(parseFloat(amount));
		}
		return amount;
	};

	// Format dates consistently
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

	// Process each organization's invoices
	const emailPromises = Object.values(groupedInvoices).map(async ({ organization, invoices }) => {
		// Format invoice data for template
		const formattedInvoices = invoices.map((invoice) => ({
			id: invoice.id,
			invoice_code: invoice.invoice_code,
			invoice_date: formatDate(invoice.invoice_date),
			due_date: formatDate(invoice.due_date),
			status: invoice.status,
			total_amount: formatAmount(invoice.total_amount),
			line_items: invoice.line_items.map((item) => ({
				product_name: item.product.name,
				description: item.description,
				quantity: item.quantity,
				rate: formatAmount(item.rate),
				amount: formatAmount(item.amount),
			})),
		}));

		const totalAmount = invoices.reduce((sum, inv) => sum + parseFloat(inv.total_amount), 0);

		const message = {
			personalizations: [
				{
					to: [{ email: organization.email }],
					cc: [{ email: 'camila@huestudios.com' }],
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
			logger.error('Invoice email failed', {
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

	try {
		const results = await Promise.all(emailPromises);
		const failedCount = results.filter((r) => r.status === 'failed').length;
		const successCount = results.filter((r) => r.status === 'success').length;

		logger.info('Invoice email batch completed', {
			totalSent: results.length,
			successful: successCount,
			failed: failedCount,
		});

		return {
			statusCode: 200,
			body: {
				message: `Sent ${successCount} invoice emails successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
				results,
			},
		};
	} catch (error) {
		logger.error('Invoice email batch failed', error);
		throw createError({
			statusCode: error.code || 500,
			message: error.message,
		});
	}
});
