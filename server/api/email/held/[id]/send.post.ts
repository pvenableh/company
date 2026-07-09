// server/api/email/held/[id]/send.post.ts
/**
 * Flush a held money-email draft — transmit it for real, now.
 *
 * AUTHORIZATION MODEL: the money gate holds AUTOMATIC transactional sends during
 * rollout. This endpoint is a DELIBERATE, authenticated, org-scoped human action
 * — a person reviewing the draft and clicking "Send". That click IS the
 * approval, so it transmits regardless of the org's money-gate allow-list (the
 * gate's job — preventing accidental/automatic client money email — is
 * preserved; a reviewed manual send is exactly what the outbox is for). Access
 * is still gated: the caller must be a member of the draft's org.
 *
 * Idempotent-ish: a draft already 'sent' is not re-transmitted (returns
 * alreadySent). A 'discarded' draft is refused.
 */
import { readItem, updateItem } from '@directus/sdk';
import sgMail from '@sendgrid/mail';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

export default defineEventHandler(async (event) => {
	const session = await requireUserSession(event);
	const userId = (session as any).user?.id;
	if (!userId) throw createError({ statusCode: 401, message: 'Authentication required' });

	const id = getRouterParam(event, 'id');
	if (!id) throw createError({ statusCode: 400, message: 'draft id is required' });

	const directus = getServerDirectus();

	const draft = (await directus.request(
		readItem('held_emails' as any, id, {
			fields: ['id', 'organization', 'status', 'payload', 'to_email', 'channel'] as any,
		}),
	)) as any;

	if (!draft) throw createError({ statusCode: 404, message: 'Draft not found' });

	const orgId = typeof draft.organization === 'object' ? draft.organization?.id : draft.organization;
	if (!orgId) throw createError({ statusCode: 400, message: 'Draft has no organization — cannot authorize a re-send.' });
	await requireOrgMembership(event, String(orgId));

	if (draft.status === 'sent') {
		return { sent: false, alreadySent: true, message: 'Draft was already sent.' };
	}
	if (draft.status === 'discarded') {
		throw createError({ statusCode: 409, message: 'Draft was discarded — cannot send.' });
	}
	if (!draft.payload) {
		throw createError({ statusCode: 422, message: 'Draft has no stored payload to send.' });
	}

	const apiKey = process.env.SENDGRID_API_KEY;
	if (!apiKey) throw createError({ statusCode: 500, message: 'SENDGRID_API_KEY not configured' });
	sgMail.setApiKey(apiKey);

	try {
		await sgMail.send(draft.payload);
	} catch (err: any) {
		console.error('[held-email/send] transmit failed:', err?.message || err);
		throw createError({ statusCode: 502, message: `Send failed: ${err?.message || 'unknown error'}` });
	}

	const now = new Date().toISOString();
	await directus.request(
		updateItem('held_emails' as any, id, { status: 'sent', sent_at: now, sent_by: userId } as any),
	);

	console.log(`[held-email/send] flushed draft ${id} (${draft.channel}) → ${draft.to_email}`);
	return { sent: true, id, to: draft.to_email, sentAt: now };
});
