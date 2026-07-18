// server/utils/ai-autonomy.ts
//
// Server side of the Earnest trust dial. The pure tier logic + metadata live in
// ~~/shared/ai-autonomy (shared with the client dial); this adds the server-only
// per-user tier lookup used at the propose fork.

export {
	AUTONOMY_SAFETY_FLOOR,
	AUTONOMY_TIERS,
	AUTONOMY_MIN,
	AUTONOMY_MAX,
	clampTier,
	shouldAutoApprove,
	type AutonomyTierInfo,
} from '~~/shared/ai-autonomy';

import { clampTier } from '~~/shared/ai-autonomy';

/**
 * Read a user's autonomy tier from directus_users. Admin client, fail-SAFE: any
 * error or missing value resolves to 0 (ask everything), so a lookup hiccup can
 * never widen autonomy.
 */
export async function getUserAutonomyTier(userId: string): Promise<0 | 1 | 2 | 3> {
	try {
		const { getServerDirectus } = await import('~~/server/utils/directus');
		const { readUser } = await import('@directus/sdk');
		const directus = await getServerDirectus();
		const user = (await directus.request(
			(readUser as any)(userId, { fields: ['ai_autonomy_tier'] }),
		)) as any;
		return clampTier(user?.ai_autonomy_tier);
	} catch {
		return 0;
	}
}
