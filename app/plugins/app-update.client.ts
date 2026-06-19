// app/plugins/app-update.client.ts
//
// Deploy-update checker. A long-open tab (or installed PWA) navigates
// client-side only and keeps running the JS bundle it first loaded, so a user
// can sit on a stale build for hours after we ship to Vercel. This polls a
// tiny /api/version endpoint and compares the server's live buildId against the
// one baked into this bundle at build time. When they diverge, a new deploy is
// live and we surface a non-intrusive "Update available — Refresh" toast.
//
// Chosen over enabling the full PWA service-worker prompt: Earnest's PWA module
// is intentionally disabled, and this achieves the same UX with no app-shell
// precaching / offline behaviour to reason about.

export default defineNuxtPlugin(() => {
	const { isDev, status, liveBuildId, check: checkVersion, refresh } = useAppVersion();

	// No-op in local dev (buildId === 'dev') — there's no deploy to detect and
	// HMR already keeps things fresh.
	if (isDev) return;

	const CHECK_INTERVAL_MS = 5 * 60 * 1000; // poll every 5 minutes
	const MIN_GAP_MS = 60 * 1000; // don't re-check more than once a minute on focus/visibility

	let lastCheck = 0;
	let promptedFor = ""; // buildId we've already prompted about — prevents spam
	let timer: ReturnType<typeof setInterval> | null = null;

	const toast = useToast();

	// Drive the toast off the shared version state so the About panel and this
	// prompt never disagree about whether a newer build is live.
	watch(status, (s) => {
		if (s !== "outdated") return;
		if (promptedFor === liveBuildId.value) return;
		promptedFor = liveBuildId.value;
		toast.add({
			title: "Update available",
			description: "A newer version of Earnest is ready.",
			color: "info",
			duration: Infinity,
			action: {
				label: "Refresh",
				onClick: () => refresh(),
			},
		});
	});

	async function check() {
		if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
		const now = Date.now();
		if (now - lastCheck < MIN_GAP_MS) return;
		lastCheck = now;
		await checkVersion();
	}

	// Periodic poll.
	timer = setInterval(check, CHECK_INTERVAL_MS);

	// Re-check when the user returns to the tab (covers laptop sleep / long idle).
	if (typeof document !== "undefined") {
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "visible") check();
		});
	}
	if (typeof window !== "undefined") {
		window.addEventListener("focus", check);
	}

	// One check shortly after load (not immediately, to stay out of the
	// hydration / first-paint critical path).
	if (typeof window !== "undefined") {
		window.setTimeout(check, 15 * 1000);
	}
});
