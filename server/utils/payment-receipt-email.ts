// server/utils/payment-receipt-email.ts
/**
 * ORG-BRANDED invoice payment + refund receipts.
 *
 * Unlike the Earnest-chrome token receipts, these render with the MERCHANT
 * org's brand (logo + brand_color + whitelabel footer, from-name = org name,
 * reply-to = the org's) because the payer is the org's client and the org is
 * the merchant — Earnest is invisible.
 *
 * Two audiences per event:
 *   - payer  → the person who paid (payment-receipt / refund-receipt templates)
 *   - staff  → the org's active owners/admins (generic template, one send each)
 * The org's `email_bcc` monitoring address is auto-attached by sendBrandedEmail.
 *
 * Best-effort throughout: called fire-and-forget from webhook/reconciliation
 * paths, a send failure must never affect payment/refund processing. Idempotency
 * is the caller's job — payment emails fire only when a new payments_received row
 * is written; refund emails only when a new adjustment is booked.
 *
 * GOTCHA: MJML compiles with noEscape, so `{{var}}` is NOT HTML-escaped. Every
 * user-controlled string (org name, payer first name, invoice label) is escaped
 * here before it reaches the template. Amounts/dates are pre-formatted (safe).
 */
import { readItems, readUsers } from '@directus/sdk';
import { escapeHtml } from './email-shell';
import { renderBrandedTemplate } from './email-templates';
import { sendBrandedEmail, fetchOrgBrand } from './email-send';

const idOf = (ref: any): string | null =>
	ref == null ? null : typeof ref === 'object' ? ref.id ?? null : String(ref);

const money = (dollars: number): string =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(Number(dollars) || 0);

const prettyDate = (iso?: string | null): string => {
	const d = iso ? new Date(iso) : new Date();
	return isNaN(d.getTime())
		? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
		: d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const METHOD_LABELS: Record<string, string> = {
	card: 'Card',
	us_bank_account: 'Bank transfer (ACH)',
	cashapp: 'Cash App',
	link: 'Link',
};
const methodLabel = (m?: string | null): string | null => {
	if (!m) return null;
	return METHOD_LABELS[m] || m.replace(/_/g, ' ');
};

const firstNameOf = (name?: string | null): string =>
	(name && String(name).trim().split(/\s+/)[0]) || '';

/** Compact "INV-123 — Website redesign" style label, whichever parts exist. */
function invoiceLabel(invoice: { invoice_code?: string | null; title?: string | null }): string {
	const parts = [invoice.invoice_code, invoice.title].map((s) => (s ? String(s).trim() : '')).filter(Boolean);
	return parts.join(' — ');
}

function appBaseUrl(): string {
	const config = useRuntimeConfig() as any;
	return config.public?.appUrl || config.public?.siteUrl || 'https://app.earnest.guru';
}

/** Active owner/admin member emails for an org. */
async function orgOwnerAdminEmails(orgId: string | null): Promise<string[]> {
	if (!orgId) return [];
	try {
		const directus = getServerDirectus();
		const memberships = (await directus.request(
			readItems('org_memberships', {
				filter: {
					organization: { _eq: orgId },
					status: { _eq: 'active' },
					role: { slug: { _in: ['owner', 'admin'] } },
				},
				fields: ['user'],
				limit: 100,
			}),
		)) as Array<{ user: any }>;
		const ids = [...new Set(memberships.map((m) => idOf(m.user)).filter(Boolean))] as string[];
		if (!ids.length) return [];
		const users = (await directus.request(
			readUsers({ filter: { id: { _in: ids }, status: { _eq: 'active' } } as any, fields: ['email'], limit: 100 }),
		)) as Array<{ email: string | null }>;
		return [...new Set(users.map((u) => u.email).filter(Boolean))] as string[];
	} catch (e) {
		console.warn('[payment-receipt] could not resolve org admins:', (e as any)?.message ?? e);
		return [];
	}
}

export interface InvoicePaymentEmailInput {
	orgId: string | null;
	invoice: { id: string; invoice_code?: string | null; title?: string | null; billing_email?: string | null };
	/** Email the payer entered / the charge's billing email. */
	payerEmail?: string | null;
	payerName?: string | null;
	amountDollars: number;
	method?: string | null;
	/** Stripe receipt_url, if available. */
	receiptUrl?: string | null;
	dateIso?: string | null;
}

/** Payer receipt + staff confirmation for a successful invoice payment. */
export async function sendInvoicePaymentEmails(input: InvoicePaymentEmailInput): Promise<void> {
	try {
		const org = await fetchOrgBrand(input.orgId);
		const orgNameRaw = (org?.name && String(org.name).trim()) || 'the team';
		const orgName = escapeHtml(orgNameRaw);
		const label = invoiceLabel(input.invoice);
		const labelEsc = label ? escapeHtml(label) : '';
		const amountFormatted = money(input.amountDollars);
		const dateFormatted = prettyDate(input.dateIso);
		const invoiceUrl = `${appBaseUrl()}/invoices/${input.invoice.id}`;

		// ── payer receipt ──
		const payerTo = (input.payerEmail || input.invoice.billing_email || '').trim();
		if (payerTo) {
			const { html, text } = await renderBrandedTemplate(
				'payment-receipt',
				{
					heading: `Payment received`,
					firstName: escapeHtml(firstNameOf(input.payerName)),
					orgName,
					amountFormatted,
					invoiceLabel: labelEsc,
					methodLabel: escapeHtml(methodLabel(input.method) || ''),
					dateFormatted,
					receiptUrl: input.receiptUrl || '',
					ctaUrl: invoiceUrl,
				},
				{ org },
			);
			await sendBrandedEmail({
				to: payerTo,
				subject: `${orgNameRaw}: payment received (${amountFormatted})`,
				html,
				text,
				org,
				categories: ['payment-receipt'],
				emailName: 'payment-receipt',
				sendCollection: 'invoices',
				sendId: input.invoice.id,
			}).catch((e) => console.warn('[payment-receipt] payer send failed:', e?.message ?? e));
		}

		// ── staff confirmation (org owners/admins) ──
		const staff = await orgOwnerAdminEmails(input.orgId);
		if (staff.length) {
			const bodyHtml =
				`<strong>${amountFormatted}</strong> was received${label ? ` toward <strong>${labelEsc}</strong>` : ''}` +
				`${input.method ? ` via ${escapeHtml(methodLabel(input.method) || '')}` : ''} on ${dateFormatted}.`;
			const { html, text } = await renderBrandedTemplate(
				'generic',
				{ heading: 'Payment received', bodyHtml, ctaUrl: invoiceUrl, ctaLabel: 'View invoice' },
				{ org },
			);
			await Promise.all(
				staff.map((to) =>
					sendBrandedEmail({
						to,
						subject: `Payment received: ${amountFormatted}${label ? ` — ${label}` : ''}`,
						html,
						text,
						org,
						categories: ['payment-received-staff'],
						emailName: 'payment-received-staff',
						sendCollection: 'invoices',
						sendId: input.invoice.id,
					}).catch((e) => console.warn('[payment-receipt] staff send failed:', e?.message ?? e)),
				),
			);
		}
	} catch (e) {
		console.warn('[payment-receipt] sendInvoicePaymentEmails failed:', (e as any)?.message ?? e);
	}
}

export interface InvoiceRefundEmailInput {
	orgId: string | null;
	invoice: { id: string; invoice_code?: string | null; title?: string | null; billing_email?: string | null };
	payerEmail?: string | null;
	payerName?: string | null;
	amountDollars: number;
	dateIso?: string | null;
}

/** Payer receipt + staff confirmation for a refund on an invoice payment. */
export async function sendInvoiceRefundEmails(input: InvoiceRefundEmailInput): Promise<void> {
	try {
		const org = await fetchOrgBrand(input.orgId);
		const orgNameRaw = (org?.name && String(org.name).trim()) || 'the team';
		const orgName = escapeHtml(orgNameRaw);
		const label = invoiceLabel(input.invoice);
		const labelEsc = label ? escapeHtml(label) : '';
		const amountFormatted = money(input.amountDollars);
		const dateFormatted = prettyDate(input.dateIso);
		const invoiceUrl = `${appBaseUrl()}/invoices/${input.invoice.id}`;

		// ── payer refund receipt ──
		const payerTo = (input.payerEmail || input.invoice.billing_email || '').trim();
		if (payerTo) {
			const { html, text } = await renderBrandedTemplate(
				'refund-receipt',
				{
					heading: 'Refund issued',
					firstName: escapeHtml(firstNameOf(input.payerName)),
					orgName,
					amountFormatted,
					invoiceLabel: labelEsc,
					dateFormatted,
				},
				{ org },
			);
			await sendBrandedEmail({
				to: payerTo,
				subject: `${orgNameRaw}: refund issued (${amountFormatted})`,
				html,
				text,
				org,
				categories: ['refund-receipt'],
				emailName: 'refund-receipt',
				sendCollection: 'invoices',
				sendId: input.invoice.id,
			}).catch((e) => console.warn('[payment-receipt] payer refund send failed:', e?.message ?? e));
		}

		// ── staff confirmation ──
		const staff = await orgOwnerAdminEmails(input.orgId);
		if (staff.length) {
			const bodyHtml =
				`A refund of <strong>${amountFormatted}</strong> was issued${label ? ` for <strong>${labelEsc}</strong>` : ''} on ${dateFormatted}.`;
			const { html, text } = await renderBrandedTemplate(
				'generic',
				{ heading: 'Refund issued', bodyHtml, ctaUrl: invoiceUrl, ctaLabel: 'View invoice' },
				{ org },
			);
			await Promise.all(
				staff.map((to) =>
					sendBrandedEmail({
						to,
						subject: `Refund issued: ${amountFormatted}${label ? ` — ${label}` : ''}`,
						html,
						text,
						org,
						categories: ['refund-issued-staff'],
						emailName: 'refund-issued-staff',
						sendCollection: 'invoices',
						sendId: input.invoice.id,
					}).catch((e) => console.warn('[payment-receipt] staff refund send failed:', e?.message ?? e)),
				),
			);
		}
	} catch (e) {
		console.warn('[payment-receipt] sendInvoiceRefundEmails failed:', (e as any)?.message ?? e);
	}
}
