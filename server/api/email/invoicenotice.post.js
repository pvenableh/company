import sgMail from '@sendgrid/mail';
import { readItem } from '@directus/sdk';
import { resolveMonitoringBcc } from '~~/server/utils/email-send';
import { evaluateMoneyGate } from '~~/server/utils/outbound-gate';
import { persistHeldEmail } from '~~/server/utils/held-email';
import { getServerDirectus } from '~~/server/utils/directus';
import { resolveBillingRecipients } from '~~/shared/billing-recipients';

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

			// Resolve who this invoice email reaches from the client's LIVE billing
			// contacts — contacts flagged is_billing_contact, ordered by sort (the
			// single source of truth). Fetched fresh (not the posted snapshot) so a
			// billing-contact change is reflected in reminders. Legacy billing_contacts
			// JSON + billing_email are fallbacks for un-migrated clients; the invoice
			// snapshot, then org emails, are the last resort if the client has nobody.
			//   TO  = live primary → invoice snapshot → client scalar → org
			//   CC  = remaining live recipients + invoice CC field + org owner
			const firstInvoice = invoices[0];
			const clientId = typeof firstInvoice?.client === 'object' ? firstInvoice.client?.id : firstInvoice?.client;

			let resolved = { to: null, cc: [], all: [] };
			if (clientId) {
				try {
					const directus = getServerDirectus();
					const LEVEL_FIELDS = [
						'billing_email', 'billing_name', 'billing_contacts',
						'contacts.email', 'contacts.first_name', 'contacts.last_name', 'contacts.is_billing_contact', 'contacts.sort',
					];
					const clientRow = await directus.request(readItem('clients', clientId, {
						fields: [
							'id', ...LEVEL_FIELDS,
							'parent_client.id', ...LEVEL_FIELDS.map((f) => `parent_client.${f}`),
							'parent_client.parent_client.id', ...LEVEL_FIELDS.map((f) => `parent_client.parent_client.${f}`),
						],
					}));
					const chain = [clientRow, clientRow?.parent_client, clientRow?.parent_client?.parent_client].filter(Boolean);
					resolved = resolveBillingRecipients(chain);
				} catch (err) {
					console.error('[invoicenotice] billing-contact resolve failed; falling back to snapshot', err?.message || err);
				}
			}

			const orgEmails = formatEmails(organization.bill_to?.emails || organization.emails);
			const primaryEmail =
				resolved.to?.email ||
				firstInvoice?.billing_email ||
				firstInvoice?.client?.billing_email ||
				orgEmails[0] ||
				organization.email;

			const invoiceExtraEmails = Array.isArray(firstInvoice?.emails) ? firstInvoice.emails : [];
			const orgOwner = organization.owner;
			const ownerEmail = typeof orgOwner === 'object' ? orgOwner?.email : null;

			// Every live billing recipient except the TO, plus per-invoice CC + owner.
			const allCcEmails = [...new Set([
				...resolved.all.map((r) => r.email),
				...invoiceExtraEmails,
				...(ownerEmail ? [ownerEmail] : []),
			])].filter((e) => e && e !== primaryEmail);

			// Monitoring BCC = global SENDGRID_BCC_EMAIL + this org's optional
			// email_bcc, excluding the to/cc recipients. Both are optional — if
			// neither is set the email simply goes out with no BCC.
			const bccList = await resolveMonitoringBcc({
				orgId: organization?.id,
				exclude: [primaryEmail || organization.email, ...allCcEmails],
			});

			const personalization = {
				to: [{ email: primaryEmail || organization.email }],
			};
			if (bccList.length > 0) {
				personalization.bcc = bccList.map((email) => ({ email }));
			}

			// Add additional CC recipients if they exist
			if (allCcEmails.length > 0) {
				personalization.cc = allCcEmails.map((email) => ({ email }));
			}

			const message = {
				personalizations: [personalization],
				from: {
					email: 'hello@earnest.guru',
					name: 'Earnest',
				},
				template_id: 'd-fc7fc838e55e41ebbf64aac386092efd',
				replyTo: {
					email: 'hello@earnest.guru',
					name: 'Earnest',
				},
				subject: 'Invoice Notice — Earnest',
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
				// Tagged as an Earnest send so the SendGrid webhook keeps the events
				// (app:'earnest') and attributes them to the org for /email/activity.
				categories: ['earnest', 'invoices'],
				customArgs: {
					app: 'earnest',
					email_name: 'invoice-notice',
					send_collection: 'invoices',
					...(organization?.id ? { organization: String(organization.id) } : {}),
				},
			};

			// MONEY GATE (default-off) — when OUTBOUND_EMAIL_GATE_MONEY is enabled,
			// only money-allow-listed orgs actually transmit; others are held as a
			// draft (not sent) so client-facing money can stay drafts during rollout.
			const moneyGate = evaluateMoneyGate(organization?.id);
			if (!moneyGate.allowed) {
				console.log('[invoice-notice] held as draft (money gate):', moneyGate.reason);
				// Persist to the draft outbox so it can be reviewed / flushed later.
				const draftId = await persistHeldEmail({
					organization: organization?.id,
					channel: 'invoice_notice',
					to: primaryEmail || organization.email,
					subject: message.subject,
					amount: totalAmount,
					reason: moneyGate.reason,
					message,
					sourceCollection: 'invoices',
					sourceId: firstInvoice?.id ?? null,
				});
				return {
					organization: organization.name,
					status: 'held',
					email: primaryEmail || organization.email,
					invoiceCount: invoices.length,
					reason: moneyGate.reason,
					draftId,
				};
			}

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
		const heldCount = results.filter((r) => r.status === 'held').length;

		return {
			statusCode: 200,
			body: {
				message: `Sent ${successCount} invoice emails successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}${heldCount > 0 ? `, ${heldCount} held as draft` : ''}`,
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
