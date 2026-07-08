/**
 * Public, unauth signing endpoint. Validates `signing_token`, records the
 * signer's name/email/IP + signature payload, transitions status to
 * `signed`, and stamps `signed_at`. Only contracts in `sent` status can be
 * signed; re-signing or signing a draft/cancelled contract is rejected.
 */
import { readItems, updateItem } from '@directus/sdk';
import { awardUserEP } from '~~/server/utils/earnestScoreUser';
import { notifyEvent } from '~~/server/utils/notify-event';
import { writeClientTimeline } from '~~/server/utils/write-timeline';

interface SignBody {
	token?: string;
	name?: string;
	email?: string;
	signature_data?: string;
	affirm?: boolean;
}

export default defineEventHandler(async (event) => {
	const body = await readBody<SignBody>(event);
	const token = body?.token?.toString().trim();
	const name = body?.name?.toString().trim();
	const email = body?.email?.toString().trim();
	const signature = body?.signature_data?.toString().trim() || name;

	if (!token) throw createError({ statusCode: 400, message: 'token required' });
	if (!name) throw createError({ statusCode: 400, message: 'name required' });
	if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
		throw createError({ statusCode: 400, message: 'valid email required' });
	}
	if (!body?.affirm) {
		throw createError({ statusCode: 400, message: 'You must affirm the signature' });
	}

	const directus = getTypedDirectus();

	const rows = await directus.request(
		readItems('contracts', {
			fields: ['id', 'contract_status', 'organization', 'user_created', 'client', 'title'],
			filter: { signing_token: { _eq: token } },
			limit: 1,
		}),
	) as any[];

	const contract = rows?.[0];
	if (!contract) throw createError({ statusCode: 404, message: 'Contract not found' });
	if (contract.contract_status !== 'sent') {
		throw createError({
			statusCode: 409,
			message: contract.contract_status === 'signed' ? 'Already signed' : 'Contract is not available for signing',
		});
	}

	const ip = getRequestIP(event, { xForwardedFor: true }) || null;

	const updated = await directus.request(
		updateItem('contracts', contract.id, {
			contract_status: 'signed',
			signed_at: new Date().toISOString(),
			signed_by_name: name,
			signed_by_email: email,
			signed_by_ip: ip,
			signature_data: signature,
		}),
	);

	// Arcade / Earnest Score reward — attribute the signed contract to whoever
	// created it. Signing happens on the public portal (no user session), so we
	// run the per-user award with the admin token and only ever UPDATE the
	// owner's existing score row (createIfMissing: false) — never create one,
	// which would mis-attribute `user_created` to the admin. Fire-and-forget.
	const ownerId =
		typeof contract.user_created === 'object' ? contract.user_created?.id : contract.user_created;
	const orgId =
		typeof contract.organization === 'object' ? contract.organization?.id : contract.organization;
	if (ownerId && orgId) {
		awardUserEP(directus, orgId, ownerId, 'contract_signed', { createIfMissing: false }).catch(
			(e) => console.warn('[contracts/sign] Failed to award EP:', e),
		);
	}

	// ── Return leg ─────────────────────────────────────────────────────────
	// Notify the agency (staff-only — never echo the signature back to the
	// client) and drop a CRM timeline row. Both are fire-and-forget: a
	// notification/log failure must not fail the signature itself.
	const clientId =
		typeof contract.client === 'object' ? contract.client?.id : contract.client;
	const contractTitle = contract.title || 'Contract';

	void notifyEvent({
		directus,
		collection: 'contracts',
		action: 'update',
		item: { contract_status: 'signed', client: clientId, title: contractTitle, organization: orgId },
		previousItem: { contract_status: 'sent' },
		itemId: String(contract.id),
		userId: '', // anonymous signer — no acting user to exclude
		orgId,
		staffOnly: true,
		actorName: name,
	}).catch((e) => console.warn('[contracts/sign] notify failed:', e));

	void writeClientTimeline({
		organizationId: orgId,
		clientId,
		verb: 'contract.signed',
		title: `${contractTitle} signed`,
		subtitle: `Signed by ${name}`,
		actorType: 'client',
		actorName: name,
		sourceCollection: 'contracts',
		sourceId: contract.id,
		href: `/contracts/${contract.id}`,
		icon: 'lucide:file-signature',
	});

	return { ok: true, id: contract.id, signed_at: (updated as any)?.signed_at };
});
