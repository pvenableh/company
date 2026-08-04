// server/api/followups/send.post.ts
//
// "Send from Earnest" — the in-app leg of the priority-action follow-up. Sends a
// branded follow-up email to a client contact on the org's behalf, logs the
// touch, and (for leads) bumps the next-follow-up date. Respects the per-org
// outbound-email gate: if the org isn't allow-listed, it returns held=true so
// the UI can tell the user to use "Draft email" (their own mail client) instead.

import { updateItem } from '@directus/sdk';
import { renderBrandedTemplate } from '~~/server/utils/email-templates';
import { sendBrandedEmail, fetchOrgBrand } from '~~/server/utils/email-send';
import { escapeHtml } from '~~/server/utils/email-shell';
import { evaluateOutboundGate } from '~~/server/utils/outbound-gate';
import { touchContacts } from '~~/server/utils/contact-touch';

interface Body {
	toEmail: string;
	toName?: string | null;
	subject: string;
	body: string;
	kind: 'proposal' | 'lead';
	refId: string;
	orgId: string;
}

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const b = (await readBody(event).catch(() => ({}))) as Body;
	if (!b?.toEmail || !b?.subject || !b?.body || !b?.orgId) {
		throw createError({ statusCode: 400, message: 'toEmail, subject, body, and orgId are required' });
	}

	// Per-org outbound gate — held becomes a "use Draft instead" hint in the UI.
	const gate = evaluateOutboundGate({ channel: 'followup', orgId: b.orgId, template: 'generic' });
	if (!gate.allowed) {
		return { ok: false, held: true, reason: gate.reason };
	}

	const org = await fetchOrgBrand(b.orgId);
	const bodyHtml = `<p style="margin:0">${escapeHtml(b.body).replace(/\n/g, '<br />')}</p>`;
	const { html, text } = await renderBrandedTemplate('generic', {
		subject: b.subject,
		preheader: b.body.slice(0, 140),
		heading: b.subject,
		bodyHtml,
		text: b.body,
	}, { org });

	const res = await sendBrandedEmail({
		to: b.toEmail,
		subject: b.subject,
		html,
		text: text || b.body,
		org,
		categories: ['followup', b.kind],
		emailName: `followup-${b.kind}`,
		sendCollection: b.kind === 'lead' ? 'leads' : 'proposals',
		sendId: b.refId ?? null,
	});
	if (!res.sent) {
		return { ok: false, reason: res.reason || 'Send failed' };
	}

	// Log the touch + advance the lead's follow-up so it drops off the list.
	await touchContacts([b.toEmail], 'email', b.orgId).catch(() => {});
	if (b.kind === 'lead' && b.refId) {
		try {
			const next = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
			await getServerDirectus().request(updateItem('leads' as any, b.refId, { next_follow_up: next } as any));
		} catch (err: any) {
			console.warn('[followups/send] lead follow-up bump failed:', err?.message);
		}
	}

	return { ok: true, to: b.toEmail };
});
