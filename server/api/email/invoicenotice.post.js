import sgMail from '@sendgrid/mail';

export default defineEventHandler(async (event) => {
	try {
		// Add method check
		if (getMethod(event) !== 'POST') {
			throw createError({
				statusCode: 405,
				statusMessage: 'Method Not Allowed',
			});
		}

		const config = useRuntimeConfig();

		// Validate SendGrid API key exists
		if (!config.SENDGRID_API_KEY) {
			throw createError({
				statusCode: 500,
				statusMessage: 'SendGrid API key not configured',
			});
		}

		const body = await readBody(event);

		// Handle all possible input formats
		let invoices;
		if (Array.isArray(body)) {
			invoices = body;
		} else if (body.invoices) {
			invoices = body.invoices;
		} else if (body.id && body.bill_to) {
			// Single invoice object
			invoices = [body];
		} else {
			throw createError({
				statusCode: 400,
				statusMessage: 'Invalid request format: expected invoice data',
			});
		}

		// Validate invoices data
		if (!Array.isArray(invoices) || invoices.length === 0) {
			throw createError({
				statusCode: 400,
				statusMessage: 'Invalid request: invoices array is required',
			});
		}

		// Validate each invoice has required fields
		for (const invoice of invoices) {
			if (!invoice.id || !invoice.bill_to) {
				throw createError({
					statusCode: 400,
					statusMessage: 'Each invoice must have id and bill_to fields',
				});
			}
		}

		console.log('Invoice notification initiated', {
			invoiceCount: invoices.length,
			organization: invoices[0]?.bill_to?.name,
		});

		sgMail.setApiKey(config.SENDGRID_API_KEY);

		// Format monetary values with error handling
		const formatAmount = (amount) => {
			try {
				if (amount === null || amount === undefined) return '$0.00';
				const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
				if (isNaN(numAmount)) return '$0.00';

				return new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency: 'USD',
				}).format(numAmount);
			} catch (error) {
				console.error('Error formatting amount:', amount, error);
				return '$0.00';
			}
		};

		// Format dates with error handling
		const formatDate = (date) => {
			try {
				if (!date) return 'No date';
				const dateObj = new Date(date);
				if (isNaN(dateObj.getTime())) return 'Invalid date';

				return dateObj.toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
				});
			} catch (error) {
				console.error('Error formatting date:', date, error);
				return 'Invalid date';
			}
		};

		// Group invoices by organization with better error handling
		const groupedInvoices = invoices.reduce((acc, invoice) => {
			try {
				const orgId = invoice.bill_to?.id;
				if (!orgId) {
					console.warn('Invoice missing organization ID:', invoice.id);
					return acc;
				}

				if (!acc[orgId]) {
					acc[orgId] = {
						organization: invoice.bill_to,
						invoices: [],
					};
				}
				acc[orgId].invoices.push(invoice);
				return acc;
			} catch (error) {
				console.error('Error processing invoice:', invoice.id, error);
				return acc;
			}
		}, {});

		// Validate we have organizations to send to
		if (Object.keys(groupedInvoices).length === 0) {
			throw createError({
				statusCode: 400,
				statusMessage: 'No valid invoices with organization data found',
			});
		}

		// Send emails for each organization
		const emailPromises = Object.values(groupedInvoices).map(async ({ organization, invoices }) => {
			try {
				// Format invoice data for template with error handling
				const formattedInvoices = invoices.map((invoice) => {
					try {
						return {
							id: invoice.id || 'N/A',
							invoice_code: invoice.invoice_code || 'N/A',
							invoice_date: formatDate(invoice.invoice_date),
							due_date: formatDate(invoice.due_date),
							status: invoice.status || 'pending',
							total_amount: formatAmount(invoice.total_amount),
							line_items: (invoice.line_items || []).map((item) => ({
								product_name: item.product?.name || 'Unknown Product',
								description: item.description || '',
								quantity: item.quantity || 0,
								rate: formatAmount(item.rate),
								amount: formatAmount(item.amount),
							})),
						};
					} catch (error) {
						console.error('Error formatting invoice:', invoice.id, error);
						return {
							id: invoice.id || 'Error',
							invoice_code: 'Error',
							invoice_date: 'Error',
							due_date: 'Error',
							status: 'error',
							total_amount: '$0.00',
							line_items: [],
						};
					}
				});

				const totalAmount = invoices.reduce((sum, inv) => {
					try {
						const amount = parseFloat(inv.total_amount) || 0;
						return sum + amount;
					} catch {
						return sum;
					}
				}, 0);

				// Helper function to validate and filter emails
				const getValidEmails = (emails) => {
					if (!emails || !Array.isArray(emails)) return [];
					return emails.filter(
						(email) => email && typeof email === 'string' && email.includes('@') && email.trim().length > 0,
					);
				};

				// Get emails with proper priority and combination logic
				let primaryEmail = null;
				let additionalEmails = [];

				// Collect all valid emails from all invoices
				let allBillToEmails = [];
				let allInvoiceEmails = [];

				for (const invoice of invoices) {
					const billToEmails = getValidEmails(invoice.bill_to?.emails);
					const invoiceEmails = getValidEmails(invoice.emails);

					allBillToEmails.push(...billToEmails);
					allInvoiceEmails.push(...invoiceEmails);
				}

				// Remove duplicates
				allBillToEmails = [...new Set(allBillToEmails)];
				allInvoiceEmails = [...new Set(allInvoiceEmails)];

				// Determine primary email (bill_to.emails takes priority for primary)
				if (allBillToEmails.length > 0) {
					primaryEmail = allBillToEmails[0];
					// Add remaining bill_to emails to additional emails
					additionalEmails.push(...allBillToEmails.slice(1));
				} else if (allInvoiceEmails.length > 0) {
					primaryEmail = allInvoiceEmails[0];
					// Add remaining invoice emails to additional emails
					additionalEmails.push(...allInvoiceEmails.slice(1));
				}

				// Always include invoice.emails in CC (if they exist and primary isn't from invoice.emails)
				if (allInvoiceEmails.length > 0 && allBillToEmails.length > 0) {
					// If primary came from bill_to.emails, add ALL invoice.emails to CC
					additionalEmails.push(...allInvoiceEmails);
				}

				// Remove duplicates from additional emails and exclude primary email
				additionalEmails = [...new Set(additionalEmails)].filter((email) => email !== primaryEmail);

				// Final fallback to organization email if it exists
				if (!primaryEmail && organization.email) {
					primaryEmail = organization.email;
				}

				if (!primaryEmail) {
					throw new Error(`No valid email found for organization: ${organization.name || 'Unknown'}`);
				}

				// Build personalization object
				const personalization = {
					to: [{ email: primaryEmail }],
					bcc: [
						{ email: 'huestudios.com@gmail.com' }, // Hardcoded BCC
					],
				};

				// Add additional emails to CC
				if (additionalEmails.length > 0) {
					personalization.cc.push(...additionalEmails.map((email) => ({ email })));
				}

				const message = {
					personalizations: [personalization],
					from: {
						email: config.FROM_EMAIL || 'mail@huestudios.company',
						name: 'hue: company',
					},
					template_id: 'd-fc7fc838e55e41ebbf64aac386092efd',
					replyTo: {
						email: config.REPLY_TO_EMAIL || 'contact@huestudios.com',
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
						organization_name: organization.name || 'Unknown Organization',
						organization_address: organization.address || 'No address provided',
						invoices: formattedInvoices,
						total_amount: formatAmount(totalAmount),
						invoice_count: invoices.length,
						email_date: formatDate(new Date()),
					},
					categories: ['hue', 'invoices'],
				};

				console.log('Sending invoice email with data:', {
					recipient: primaryEmail,
					invoiceCount: invoices.length,
					totalAmount: formatAmount(totalAmount),
				});

				const response = await sgMail.send(message);

				console.log('Invoice email sent successfully', {
					organization: organization.name,
					email: primaryEmail,
					invoiceCount: invoices.length,
				});

				return {
					organization: organization.name,
					status: 'success',
					email: primaryEmail,
					invoiceCount: invoices.length,
				};
			} catch (error) {
				console.error('Failed to send invoice email', {
					organization: organization.name,
					error: error.message,
				});

				return {
					organization: organization.name,
					status: 'failed',
					error: error.message,
				};
			}
		});

		const results = await Promise.all(emailPromises);
		const failedCount = results.filter((r) => r.status === 'failed').length;
		const successCount = results.filter((r) => r.status === 'success').length;

		// Set appropriate status code based on results
		const statusCode = failedCount > 0 && successCount === 0 ? 500 : 200;

		return {
			statusCode,
			success: successCount > 0,
			message: `Sent ${successCount} invoice emails successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
			results,
			summary: {
				total: results.length,
				successful: successCount,
				failed: failedCount,
			},
		};
	} catch (error) {
		console.error('Invoice email process failed', error);

		throw createError({
			statusCode: error.statusCode || 500,
			statusMessage: error.statusMessage || error.message || 'Failed to process invoice emails',
		});
	}
});
