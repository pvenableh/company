<script setup lang="ts">
/**
 * Dismissible install-promo banner shown above the CardDesk dashboard stats
 * grid. Routes the user to https://carddesk.earnest.guru/ where the live
 * install affordances (Phase 3's CdInstallPrompt) take over.
 *
 * Persistence: `directus_users.app_pref_carddesk_promo_dismissed_at`.
 *   - null           → show
 *   - within 30 days → suppress ("Dismiss for 30 days")
 *   - far-future     → permanent ("Don't show again")
 */
const CARDDESK_URL = 'https://carddesk.earnest.guru/';
const NEVER_TIMESTAMP = '9999-12-31T00:00:00Z';
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

const { user } = useDirectusAuth();
const { updateMe } = useDirectusUsers();
const { isIOS, isStandalone, canInstallPwa } = useUserAgent();

// Optimistic local cache — patches re-render immediately while the PATCH /me
// round-trips. Initialised on mount from the user record.
const dismissedAt = ref<string | null>(null);

const isDismissed = computed(() => {
	if (!dismissedAt.value) return false;
	const ts = new Date(dismissedAt.value).getTime();
	if (Number.isNaN(ts)) return false;
	// Far-future timestamp encodes the "don't show again" choice.
	if (ts > Date.now() + 365 * 24 * 60 * 60 * 1000) return true;
	return Date.now() - ts < SNOOZE_MS;
});

const visible = computed(() => {
	// Hide when we're already inside an installed PWA (Earnest itself or
	// CardDesk wouldn't render this page, but defensive). Hide on platforms
	// that can't actually install anything.
	if (isStandalone) return false;
	if (!canInstallPwa) return false;
	if (isDismissed.value) return false;
	return true;
});

const patch = async (value: string | null) => {
	dismissedAt.value = value;
	if (!user.value?.id) return;
	try {
		await updateMe({ app_pref_carddesk_promo_dismissed_at: value } as any);
	} catch (e) {
		console.warn('[CardDeskInstallPromo] dismissal patch failed:', e);
	}
};

const dismissThirtyDays = () => patch(new Date().toISOString());
const dismissForever = () => patch(NEVER_TIMESTAMP);

onMounted(() => {
	const stored = (user.value as any)?.app_pref_carddesk_promo_dismissed_at;
	if (stored) dismissedAt.value = stored;
});
</script>

<template>
	<div
		v-if="visible"
		class="cd-promo relative mb-6 overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-slate-50 to-slate-50 p-4 sm:p-5 dark:from-emerald-400/10 dark:via-slate-900/40 dark:to-slate-900/40 dark:border-emerald-400/20"
	>
		<!-- Decorative phone-shaped chip -->
		<div class="absolute -right-4 -bottom-4 hidden sm:block opacity-50 dark:opacity-40 pointer-events-none">
			<div class="w-24 h-32 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 rotate-12 shadow-lg shadow-emerald-500/20" />
		</div>

		<div class="relative flex flex-col sm:flex-row sm:items-center gap-4">
			<div class="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm shadow-emerald-500/30">
				<Icon name="lucide:smartphone" class="w-5 h-5 text-white" />
			</div>

			<div class="flex-1 min-w-0">
				<div class="text-[10px] uppercase tracking-[0.18em] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
					CardDesk · companion app
				</div>
				<h3 class="text-sm font-semibold text-gray-900 dark:text-white">
					<template v-if="isIOS">Scan business cards on the go</template>
					<template v-else>Install CardDesk as an app</template>
				</h3>
				<p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
					<template v-if="isIOS">
						Open carddesk.earnest.guru on your iPhone → tap Share → Add to Home Screen.
					</template>
					<template v-else>
						Get the full CardDesk experience in its own window — scans, rolodex, and your XP streak.
					</template>
				</p>
			</div>

			<div class="flex items-center gap-2 flex-shrink-0">
				<a
					:href="CARDDESK_URL"
					target="_blank"
					rel="noopener"
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold shadow-sm shadow-emerald-500/30 transition-colors"
				>
					<Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5" />
					{{ isIOS ? 'Open on iPhone' : 'Open CardDesk' }}
				</a>
			</div>
		</div>

		<!-- Dismiss controls (separate row so they don't compete with the CTA) -->
		<div class="relative flex items-center justify-end gap-3 mt-3 text-[11px]">
			<button
				type="button"
				class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
				@click="dismissThirtyDays"
			>
				Dismiss for 30 days
			</button>
			<span class="text-gray-300 dark:text-gray-600">·</span>
			<button
				type="button"
				class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
				@click="dismissForever"
			>
				Don't show again
			</button>
		</div>
	</div>
</template>
