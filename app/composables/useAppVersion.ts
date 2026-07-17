// useAppVersion — single source of truth for "which build am I running, and is
// it the latest deploy?".
//
// The semantic `version` (from package.json) is the human-readable label a user
// reads to confirm their release. The `buildId` (Vercel commit SHA, baked into
// this bundle at build time) is the actual freshness signal: when the live
// server reports a different buildId, a newer deploy is out and this tab is
// stale. Both the About panel and the deploy-update toast plugin share this
// state via useState so they never disagree.

export type VersionStatus = "unknown" | "checking" | "current" | "outdated";

export function useAppVersion() {
	const config = useRuntimeConfig();
	const currentVersion = String(config.public.appVersion || "dev");
	const currentBuildId = String(config.public.buildId || "");

	// In local dev there's no deploy to compare against; treat as current.
	const isDev = !currentBuildId || currentBuildId === "dev";

	const status = useState<VersionStatus>("app-version:status", () =>
		isDev ? "current" : "unknown",
	);
	const liveVersion = useState<string>("app-version:live-version", () => currentVersion);
	const liveBuildId = useState<string>("app-version:live-build", () => currentBuildId);
	const lastCheckedAt = useState<number | null>("app-version:checked-at", () => null);

	// Short, comparable build label (first 7 of a commit SHA) for display.
	const shortBuildId = computed(() =>
		currentBuildId && currentBuildId !== "dev" ? currentBuildId.slice(0, 7) : currentBuildId,
	);

	async function check(): Promise<VersionStatus> {
		if (isDev) {
			status.value = "current";
			return status.value;
		}
		// Don't clobber a known status with "checking" flicker on background polls;
		// only show "checking" before we have ever resolved.
		if (status.value === "unknown") status.value = "checking";
		try {
			const res = await $fetch<{ buildId: string; version: string }>("/api/version");
			liveBuildId.value = String(res.buildId || "");
			liveVersion.value = String(res.version || currentVersion);
			lastCheckedAt.value = Date.now();
			status.value =
				liveBuildId.value && liveBuildId.value !== currentBuildId ? "outdated" : "current";
		} catch {
			// Network hiccup / offline — leave prior status untouched, just note
			// we couldn't confirm if we'd never resolved before.
			if (status.value === "checking") status.value = "unknown";
		}
		return status.value;
	}

	async function refresh() {
		// Best-effort cache-bust before the hard reload so the new build can't be
		// served stale assets: clear any Cache Storage and nudge service workers to
		// update. The PWA is disabled (the only SW is push-only, no fetch handler),
		// so this is belt-and-suspenders — but it makes "Reload" authoritative.
		if (typeof window !== 'undefined') {
			try {
				if ('caches' in window) {
					const keys = await caches.keys();
					await Promise.all(keys.map((k) => caches.delete(k)));
				}
			} catch {
				/* ignore — proceed to reload regardless */
			}
			try {
				if ('serviceWorker' in navigator) {
					const regs = await navigator.serviceWorker.getRegistrations();
					await Promise.all(regs.map((r) => r.update()));
				}
			} catch {
				/* ignore */
			}
		}
		reloadNuxtApp({ force: true });
	}

	return {
		currentVersion,
		currentBuildId,
		shortBuildId,
		liveVersion,
		liveBuildId,
		status,
		lastCheckedAt,
		isDev,
		check,
		refresh,
	};
}
