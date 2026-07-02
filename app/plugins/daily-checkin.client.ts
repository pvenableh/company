// plugins/daily-checkin.client.ts
//
// Fires the once-per-day Earnest Score check-in (daily_login EP) shortly after
// the app loads, as soon as the user + active org have resolved. Guarded by a
// per-user, per-day localStorage flag so we don't spam the endpoint across tabs
// or navigations; the server also enforces once-per-day as the real backstop.
//
// Client-only (`.client.ts`) — there's no point running this during SSR.

export default defineNuxtPlugin(() => {
	const { user } = useDirectusAuth();
	const { selectedOrg } = useOrganization();

	let done = false;

	const run = async () => {
		if (done) return;
		const uid = user.value?.id;
		const org = selectedOrg.value;
		if (!uid || !org) return;

		const key = `earnest:checkin:${uid}:${new Date().toISOString().split('T')[0]}`;
		let claimedKey = false;
		try {
			if (localStorage.getItem(key)) { done = true; return; }
			// Claim optimistically so two tabs racing don't both POST.
			localStorage.setItem(key, '1');
			claimedKey = true;
			done = true;
			await $fetch('/api/score/checkin', { method: 'POST', body: { orgId: org } });
		} catch {
			// Roll back so a transient failure can retry on the next load.
			if (claimedKey) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
			done = false;
		}
	};

	// Run once user + org are both ready (they resolve asynchronously after boot).
	watch([() => user.value?.id, () => selectedOrg.value], run, { immediate: true });
});
