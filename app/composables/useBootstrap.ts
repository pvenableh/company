/**
 * useBootstrap — one client fetch for the login-time chrome scalars.
 *
 * Calls GET /api/bootstrap once per org (coalesced via a module-level inflight
 * promise, like useOrganization's _orgInitInflight) and seeds the SAME useState
 * singletons the individual widgets read — `channel-unread` and
 * `ai-pending-actions-count`. Those composables' own login-time fetch then
 * coalesces onto (or skips because of) this one request instead of each firing
 * its own, which is what removed the parallel-burst pressure.
 *
 * Worst case (bootstrap not yet started when a widget refreshes) degrades to the
 * previous behaviour — the widget just fetches directly — so this is safe.
 */
interface BootstrapData {
	channelsUnread: { channels: Record<string, { count: number; lastReadAt: string | null }>; total: number };
	aiPendingCount: number;
}

let _inflight: Promise<BootstrapData | null> | null = null;
let _loadedOrg: string | null = null;

export function useBootstrap() {
	const { selectedOrg } = useOrganization();
	const seededAt = useState<number>('bootstrap-seeded-at', () => 0);
	const channelUnread = useState<BootstrapData['channelsUnread']>('channel-unread', () => ({ channels: {}, total: 0 }));
	const aiPendingCount = useState<number>('ai-pending-actions-count', () => 0);

	const orgId = () => ((selectedOrg.value as any)?.id || selectedOrg.value || '') as string;

	function load(): Promise<BootstrapData | null> {
		if (!import.meta.client) return Promise.resolve(null);
		const org = orgId();
		// Coalesce concurrent callers; re-fetch when the org actually changes.
		if (_inflight && _loadedOrg === org) return _inflight;
		_loadedOrg = org;
		_inflight = (async () => {
			try {
				const data = await $fetch<BootstrapData>('/api/bootstrap', { query: { org } });
				// Seed the shared singletons so the widgets find data already present.
				channelUnread.value = {
					channels: data?.channelsUnread?.channels || {},
					total: data?.channelsUnread?.total || 0,
				};
				aiPendingCount.value = Number(data?.aiPendingCount ?? 0);
				seededAt.value = Date.now();
				return data;
			} catch {
				return null; // non-fatal — widgets fall back to their own fetch
			} finally {
				_inflight = null;
			}
		})();
		return _inflight;
	}

	/** The in-flight bootstrap promise, if one is running right now (else null). */
	const whenReady = () => _inflight;
	/** True if bootstrap seeded the singletons within the last few seconds. */
	const isFresh = () => Date.now() - seededAt.value < 8000;

	return { load, whenReady, isFresh, seededAt };
}
