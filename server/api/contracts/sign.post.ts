/**
 * Public, unauth signing endpoint. Validates `signing_token`, records the
 * signer's name/email/IP + signature payload, transitions status to
 * `signed`, and stamps `signed_at`. Only contracts in `sent` status can be
 * signed; re-signing or signing a draft/cancelled contract is rejected.
 */
import { readItems, updateItem } from '@directus/sdk';

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
			fields: ['id', 'contract_status'],
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

	return { ok: true, id: contract.id, signed_at: (updated as any)?.signed_at };
});
