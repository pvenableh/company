import sgMail from '@sendgrid/mail';

export default defineEventHandler(async (event) => {
	try {
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
				message: 'Invalid request format: expected invoice data',
			});
		}

		// Validate invoices data
		if (!Array.isArray(invoices) || invoices.length === 0) {
			throw createError({
				statusCode: 400,
				message: 'Invalid request: invoices array is required',
			});
		}

		console.log('Invoice notification initiated', {
			invoiceCount: invoices.length,
			organization: invoices[0]?.bill_to?.name,
		});

		sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

		// Check overdue status
		const isOverdue = (dueDate) => {
			const due = new Date(dueDate);
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			due.setHours(0, 0, 0, 0);
			return due < today;
		};

		// Get days overdue
		const getDaysOverdue = (dueDate) => {
			const due = new Date(dueDate);
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			due.setHours(0, 0, 0, 0);

			const diffTime = today - due;
			const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

			return diffDays > 0 ? diffDays : 0;
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
		const groupedInvoices = invoices.reduce((acc, invoice) => {
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
				overdue: isOverdue(invoice.due_date),
				days_overdue: getDaysOverdue(invoice.due_date),
				line_items: invoice.line_items.map((item) => ({
					product_name: item.product.name,
					description: item.description,
					quantity: item.quantity,
					rate: formatAmount(item.rate),
					amount: formatAmount(item.amount),
				})),
			}));

			const totalAmount = invoices.reduce((sum, inv) => sum + parseFloat(inv.total_amount), 0);

			// Handle array of emails
			const formatEmails = (emails) => {
				if (!emails) return [];
				return Array.isArray(emails) ? emails : [emails];
			};

			// Build recipient list:
			// - All client billing_contacts get the email (first = TO, rest = CC)
			// - Invoice snapshot billing_email overrides TO if set
			// - Organization owner is always CC'd
			// - Organization emails are fallback if no billing contacts exist
			const firstInvoice = invoices[0];

			// Parse billing_contacts — may be a JSON string or already an array
			let rawContacts = firstInvoice?.client?.billing_contacts || firstInvoice?.billing_contacts || [];
			if (typeof rawContacts === 'string') {
				try { rawContacts = JSON.parse(rawContacts); } catch { rawContacts = []; }
			}
			const billingContacts = Array.isArray(rawContacts) ? rawContacts : [];
			const contactEmails = billingContacts.filter((c) => c.email?.trim()).map((c) => c.email.trim());

			// Determine primary recipient (TO)
			let primaryEmail;
			if (firstInvoice?.billing_email) {
				primaryEmail = firstInvoice.billing_email;
			} else if (contactEmails.length > 0) {
				primaryEmail = contactEmails[0];
			} else if (firstInvoice?.client?.billing_email) {
				primaryEmail = firstInvoice.client.billing_email;
			} else {
				const orgEmails = formatEmails(organization.bill_to?.emails || organization.emails);
				primaryEmail = orgEmails[0] || organization.email;
			}

			// Build CC list: remaining billing contacts + invoice CC field + org owner
			const remainingContacts = contactEmails.slice(1).filter((e) => e !== primaryEmail);
			const invoiceExtraEmails = Array.isArray(firstInvoice?.emails) ? firstInvoice.emails : [];

			// Resolve organization owner email
			const orgOwner = organization.owner;
			const ownerEmail = typeof orgOwner === 'object' ? orgOwner?.email : null;

			const allCcEmails = [...new Set([...remainingContacts, ...invoiceExtraEmails, ...(ownerEmail ? [ownerEmail] : [])])]
				.filter((e) => e && e !== primaryEmail);

			const personalization = {
				to: [{ email: primaryEmail || organization.email }],
				bcc: [{ email: 'huestudios.com@gmail.com' }, { email: 'camila@huestudios.com' }],
			};

			// Add additional CC recipients if they exist
			if (allCcEmails.length > 0) {
				personalization.cc = allCcEmails.map((email) => ({ email }));
			}

			const message = {
				personalizations: [personalization],
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
					organization_address: organization.address || 'No address provided',
					invoices: formattedInvoices,
					total_amount: formatAmount(totalAmount),
					invoice_count: invoices.length,
					email_date: formatDate(new Date()),
					has_overdue: formattedInvoices.some((inv) => inv.overdue),
				},
				categories: ['hue', 'invoices'],
			};

			try {
				console.log('Sending invoice email with data:', {
					recipient: organization.email,
					invoiceCount: invoices.length,
					totalAmount: formatAmount(totalAmount),
				});

				console.log('Invoice overdue check:', {
					due_date_raw: invoices[0].due_date,
					overdue: formattedInvoices[0].overdue,
					days_overdue: formattedInvoices[0].days_overdue,
				});

				console.log('dynamicTemplateData:', JSON.stringify(message.dynamicTemplateData, null, 2));

				const response = await sgMail.send(message);

				console.log('Invoice email sent successfully', {
					organization: organization.name,
					email: organization.email,
					invoiceCount: invoices.length,
				});

				return {
					organization: organization.name,
					status: 'success',
					email: organization.email,
					invoiceCount: invoices.length,
				};
			} catch (error) {
				console.error('Failed to send invoice email', {
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
		console.error('Invoice email process failed', error);
		throw createError({
			statusCode: error.statusCode || 500,
			message: error.message || 'Failed to process invoice emails',
		});
	}
});
