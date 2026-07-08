// server/api/contracts/[id]/send.post.ts
/**
 * Send a contract for signature — the server-side "Send for signature" action.
 *
 * Historically this lived entirely client-side (ContractWorkspace.sendForSignature):
 * it patched contract_status→'sent', minted a signing_token, and copied the link
 * to the clipboard. No email was sent and nothing recorded WHO it went to.
 *
 * This endpoint moves that transition server-side (admin token, auditable) and,
 * for gate-allowed orgs, actually emails the branded signing link to the
 * contract's contact. "Send for signature" IS the human send gesture, so it
 * transmits on click when the org is on the outbound allow-list; for every other
 * org it degrades to the old clipboard behaviour (transmitted:false + the url).
 *
 * The signer's own affirmative "I agree & sign" gesture on the public page is
 * unchanged (contracts/sign.post.ts still requires `affirm`) — ESIGN/UETA intact.
 *
 * Auth: requireUserSession + requireOrgMembership on the contract's org. Only a
 * draft/sent contract can be (re)sent; signed/declined/cancelled/expired 409.
 */
import { readItem, updateItem } from '@directus/sdk';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { fetchOrgBrand, sendBrandedEmail } from '~~/server/utils/email-send';
import { renderBrandedTemplate } from '~~/server/utils/email-templates';
import { evaluateOutboundGate } from '~~/server/utils/outbound-gate';
import { writeClientTimeline } from '~~/server/utils/write-timeline';

function resolveId(v: any): string | null {
	if (v == null) return null;
	if (typeof v === 'object') return v.id != null ? String(v.id) : null;
	return String(v);
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, message: 'Contract id is required' });

	const directus = getTypedDirectus();

	const contract = (await directus
		.request(readItem('contracts' as any, id, {
			fields: [
				'id', 'title', 'contract_status', 'organization', 'signing_token', 'date_sent', 'client',
				'contact.id', 'contact.first_name', 'contact.last_name', 'contact.email',
			] as any,
		}))
		.catch(() => null)) as any;
	if (!contract) throw createError({ statusCode: 404, message: 'Contract not found' });

	const organizationId = resolveId(contract.organization);
	if (!organizationId) throw createError({ statusCode: 400, message: 'Contract has no organization' });
	await requireOrgMembership(event, organizationId);

	const status = String(contract.contract_status || 'draft');
	if (!['draft', 'sent'].includes(status)) {
		throw createError({ statusCode: 409, message: `A ${status} contract can't be sent for signature` });
	}

	// 1. Server-side transition (idempotent): mark sent, mint a token + date once.
	const token = contract.signing_token || crypto.randomUUID();
	const patch: Record<string, any> = { contract_status: 'sent' };
	if (!contract.signing_token) patch.signing_token = token;
	if (!contract.date_sent) patch.date_sent = new Date().toISOString().split('T')[0];
	await directus.request(updateItem('contracts' as any, id, patch));

	const config = useRuntimeConfig() as any;
	const base = String(config.public?.appUrl || 'https://app.earnest.guru').replace(/\/$/, '');
	const signUrl = `${base}/contracts/sign/${token}`;

	const contact = contract.contact || null;
	const to = (contact?.email || '').toString().trim();
	const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ').trim() || null;
	const contractTitle = contract.title || 'your contract';
	const clientId = resolveId(contract.client);

	// 2. No recipient on file → can't email. Fall back to the clipboard link.
	if (!to) {
		return {
			ok: true, id, status: 'sent', signing_token: token, url: signUrl,
			transmitted: false, reason: 'no contact email on file — copy the link manually',
		};
	}

	// 3. Outbound gate — transmit only for allow-listed orgs, else clipboard link.
	const gate = evaluateOutboundGate({ channel: 'contract_signature', orgId: organizationId, template: 'generic' });
	if (!gate.allowed) {
		return {
			ok: true, id, status: 'sent', signing_token: token, url: signUrl,
			transmitted: false, reason: gate.reason, recipient: to,
		};
	}

	// 4. Render + transmit the branded signing email.
	const org = await fetchOrgBrand(organizationId);
	const orgName = (org?.name && String(org.name).trim()) || 'us';
	const greeting = contactName ? `Hi ${contactName},` : 'Hi there,';
	const subject = `Please sign: ${contractTitle}`;
	const bodyHtml =
		`<p>${greeting}</p>` +
		`<p>${orgName} has sent you a contract to review and sign${contract.title ? `: <strong>${contract.title}</strong>` : ''}.</p>` +
		`<p>Click below to review the terms and add your signature. It only takes a minute.</p>`;

	const { html, text } = await renderBrandedTemplate('generic', {
		subject,
		preheader: subject,
		heading: 'Contract ready to sign',
		bodyHtml,
		ctaUrl: signUrl,
		ctaLabel: 'Review & sign',
	}, { org });

	const res = await sendBrandedEmail({
		to,
		subject,
		html,
		text,
		org,
		categories: ['transactional', 'contract'],
		emailName: 'contract-signature',
		sendCollection: 'contracts',
		sendId: id,
	});
	if (!res.sent) {
		// Transport failed — the contract is still marked sent; surface the link.
		return {
			ok: true, id, status: 'sent', signing_token: token, url: signUrl,
			transmitted: false, reason: res.reason || 'email transport failed', recipient: to,
		};
	}

	// 5. Record who it went to — the "no contact record" gap. Fire-and-forget.
	void writeClientTimeline({
		organizationId,
		clientId,
		verb: 'contract.sent',
		title: `${contractTitle} sent for signature`,
		subtitle: `Emailed to ${contactName ? `${contactName} (${to})` : to}`,
		actorType: 'staff',
		actorUserId: userId,
		sourceCollection: 'contracts',
		sourceId: id,
		href: `/contracts/${id}`,
		icon: 'lucide:send',
	});

	return { ok: true, id, status: 'sent', signing_token: token, url: signUrl, transmitted: true, recipient: to };
});
