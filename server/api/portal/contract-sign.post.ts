// server/api/portal/contract-sign.post.ts
/**
 * POST /api/portal/contract-sign
 *
 * Portal-side signing endpoint. Unlike the public `/api/contracts/sign`
 * route (which auths off the contract's signing_token shared via email), this
 * one auths off the portal user's session — the contract just has to belong
 * to the same client+org that the user has portal access to.
 *
 * Body: { contractId: string, name: string, email: string,
 *         signature_data?: string, affirm: true }
 */

import { readItem, updateItem } from '@directus/sdk';
import { requirePortalContext } from '~~/server/utils/portal-auth';

interface Body {
	contractId?: string;
	name?: string;
	email?: string;
	signature_data?: string;
	affirm?: boolean;
}

export default defineEventHandler(async (event) => {
	const ctx = await requirePortalContext(event);
	if (ctx.isPreview) {
		throw createError({ statusCode: 403, message: 'Portal preview is read-only — sign as the real client account.' });
	}

	const body = await readBody<Body>(event);
	const contractId = body?.contractId?.toString().trim();
	const name = body?.name?.toString().trim();
	const email = body?.email?.toString().trim();
	const signature = body?.signature_data?.toString().trim() || name;

	if (!contractId) throw createError({ statusCode: 400, message: 'contractId required' });
	if (!name) throw createError({ statusCode: 400, message: 'name required' });
	if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
		throw createError({ statusCode: 400, message: 'valid email required' });
	}
	if (!body?.affirm) {
		throw createError({ statusCode: 400, message: 'You must affirm the signature' });
	}

	const directus = getServerDirectus();

	let row: any;
	try {
		row = await directus.request(
			readItem('contracts', contractId, {
				fields: ['id', 'contract_status', 'organization', 'client'],
			}),
		);
	} catch {
		throw createError({ statusCode: 404, message: 'Contract not found' });
	}

	const orgId = typeof row?.organization === 'object' ? row.organization?.id : row?.organization;
	const clientId = typeof row?.client === 'object' ? row.client?.id : row?.client;

	if (!orgId || orgId !== ctx.organizationId) {
		throw createError({ statusCode: 404, message: 'Contract not found' });
	}
	if (!clientId || !ctx.scopedClientIds.includes(clientId)) {
		throw createError({ statusCode: 404, message: 'Contract not found' });
	}

	if (row.contract_status !== 'sent') {
		throw createError({
			statusCode: 409,
			message: row.contract_status === 'signed' ? 'Already signed' : 'Contract is not available for signing',
		});
	}

	const ip = getRequestIP(event, { xForwardedFor: true }) || null;

	const updated = await directus.request(
		updateItem('contracts', contractId, {
			contract_status: 'signed',
			signed_at: new Date().toISOString(),
			signed_by_name: name,
			signed_by_email: email,
			signed_by_ip: ip,
			signature_data: signature,
		}),
	);

	return { ok: true, id: contractId, signed_at: (updated as any)?.signed_at };
});
