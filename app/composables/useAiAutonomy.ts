// composables/useAiAutonomy.ts
//
// The client side of the Earnest trust dial — the acting user's autonomy tier
// (0–3), read/written on directus_users.ai_autonomy_tier via readMe/updateMe
// (same per-user-pref pattern as useAppPalette). The tiers + safety floor are
// the shared source of truth in ~~/shared/ai-autonomy.

import { AUTONOMY_TIERS, clampTier, type AutonomyTierInfo } from '~~/shared/ai-autonomy';

export function useAiAutonomy() {
	const tier = useState<number>('ai-autonomy-tier', () => 0);
	const loaded = useState<boolean>('ai-autonomy-loaded', () => false);
	const saving = useState<boolean>('ai-autonomy-saving', () => false);
	const { readMe, updateMe } = useDirectusUsers();

	async function load(force = false) {
		if (loaded.value && !force) return;
		try {
			const me = (await readMe({ fields: ['ai_autonomy_tier'] })) as { ai_autonomy_tier?: number | null } | null;
			tier.value = clampTier(me?.ai_autonomy_tier);
			loaded.value = true;
		} catch {
			/* stays at the safe default (0) */
		}
	}

	async function setTier(next: number) {
		const t = clampTier(next);
		if (t === tier.value) return;
		const prev = tier.value;
		tier.value = t; // optimistic
		saving.value = true;
		try {
			await updateMe({ ai_autonomy_tier: t });
		} catch {
			tier.value = prev; // rollback
			const { toast } = await import('vue-sonner');
			toast.error('Could not update your autonomy setting');
		} finally {
			saving.value = false;
		}
	}

	const current = computed<AutonomyTierInfo>(() => AUTONOMY_TIERS[clampTier(tier.value)]!);

	return { tier, current, loaded, saving, load, setTier, TIERS: AUTONOMY_TIERS };
}
