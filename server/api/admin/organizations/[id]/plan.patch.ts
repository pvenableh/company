// PATCH /api/admin/organizations/[id]/plan
//
// Earnest platform-admin control to set an organization's plan tier directly —
// the management primitive for comping an org to `enterprise` (all features, no
// Stripe subscription) the way hue is handled, and for repeating that perk on
// any other org. Gated by `requirePlatformAdmin` (Directus super-admin only);
// there is deliberately no org-role path to this endpoint.
//
// Entitlement (`organizations.plan`) and billing (Stripe subscription) are
// separate axes — this only touches the tier. Pass `wholesale_pricing` to also
// flip pricing in the same call (the common "wholesale enterprise" grant, e.g.
// hue), and `ai_token_limit_monthly` to set the monthly AI allotment a comped
// enterprise org would otherwise never receive (no Stripe subscription = no
// webhook to seed it). This makes a full comp one action, not three edits.
//
// Body: {
//   plan: 'free'|'solo'|'studio'|'agency'|'enterprise',
//   wholesale_pricing?: boolean,
//   ai_token_limit_monthly?: number | null,  // monthly token allotment
// }
import { readItem, updateItem } from '@directus/sdk';
import { requirePlatformAdmin } from '~~/server/utils/require-platform-admin';

const VALID_PLANS = ['free', 'solo', 'studio', 'agency', 'enterprise'] as const;
type PlanTier = (typeof VALID_PLANS)[number];

export default defineEventHandler(async (event) => {
	const admin = await requirePlatformAdmin(event);

	const orgId = getRouterParam(event, 'id');
	if (!orgId) {
		throw createError({ statusCode: 400, message: 'organization id is required' });
	}

	const body = await readBody<{
		plan?: string;
		wholesale_pricing?: boolean;
		ai_token_limit_monthly?: number | null;
	}>(event);
	if (!body?.plan || !VALID_PLANS.includes(body.plan as PlanTier)) {
		throw createError({
			statusCode: 400,
			message: `plan is required and must be one of: ${VALID_PLANS.join(', ')}`,
		});
	}
	if (body.wholesale_pricing !== undefined && typeof body.wholesale_pricing !== 'boolean') {
		throw createError({ statusCode: 400, message: 'wholesale_pricing must be a boolean' });
	}
	if (
		body.ai_token_limit_monthly !== undefined &&
		body.ai_token_limit_monthly !== null &&
		(typeof body.ai_token_limit_monthly !== 'number' || body.ai_token_limit_monthly < 0)
	) {
		throw createError({
			statusCode: 400,
			message: 'ai_token_limit_monthly must be a non-negative number or null',
		});
	}

	const directus = getTypedDirectus();

	const org = (await directus
		.request(readItem('organizations', orgId, { fields: ['id', 'name', 'plan', 'wholesale_pricing'] }))
		.catch(() => null)) as
		| { id: string; name?: string | null; plan?: string | null; wholesale_pricing?: boolean }
		| null;

	if (!org) {
		throw createError({ statusCode: 404, message: 'Organization not found' });
	}

	const patch: Record<string, unknown> = { plan: body.plan };
	if (body.wholesale_pricing !== undefined) {
		patch.wholesale_pricing = body.wholesale_pricing;
	}
	if (body.ai_token_limit_monthly !== undefined) {
		patch.ai_token_limit_monthly = body.ai_token_limit_monthly;
	}

	await directus.request(updateItem('organizations', orgId, patch));

	console.log(
		`[admin/plan] ${admin.email || admin.id} set plan=${body.plan}` +
			(body.wholesale_pricing !== undefined ? ` wholesale_pricing=${body.wholesale_pricing}` : '') +
			(body.ai_token_limit_monthly !== undefined
				? ` ai_token_limit_monthly=${body.ai_token_limit_monthly}`
				: '') +
			` on org ${orgId} (${org.name || 'unnamed'})`,
	);

	return {
		id: orgId,
		name: org.name ?? null,
		plan: body.plan as PlanTier,
		wholesale_pricing:
			body.wholesale_pricing !== undefined ? body.wholesale_pricing : org.wholesale_pricing ?? false,
	};
});
