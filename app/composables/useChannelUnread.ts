/**
 * Channel unread state — shared across the channels roster, the message pane's
 * "new messages" divider, and the AppRail badge.
 *
 * Reads server-computed counts from GET /api/channels/unread (per-user, based on
 * channel_members.last_read_at) and advances the cursor via POST
 * /api/channels/:id/read. State is a useState singleton so every consumer stays
 * in sync. See project_channels_apps_home.
 */
interface ChannelUnread {
	count: number;
	lastReadAt: string | null;
}
interface UnreadState {
	channels: Record<string, ChannelUnread>;
	total: number;
}

// Module-level guard so the ~6 consumers that call refresh() on mount collapse
// into ONE request (this composable had no concurrency guard, so a home load
// fired /api/channels/unread 4×). Mirrors the active-clients inflight guard.
let _unreadInflight: Promise<void> | null = null;

export function useChannelUnread() {
	const state = useState<UnreadState>('channel-unread', () => ({ channels: {}, total: 0 }));
	const boot = useBootstrap();

	async function refresh(opts?: { force?: boolean }) {
		// Coalesce the login-time fetch onto /api/bootstrap (which seeds `state`)
		// instead of firing our own. `force` (and the 45s poll after the seed goes
		// stale) still fetches directly.
		if (!opts?.force) {
			const inflight = boot.whenReady();
			if (inflight) { await inflight; return; }
			if (boot.isFresh()) return;
			if (_unreadInflight) return _unreadInflight; // collapse concurrent callers
		}
		_unreadInflight = (async () => {
			try {
				const data = await $fetch<UnreadState>('/api/channels/unread');
				state.value = { channels: data?.channels || {}, total: data?.total || 0 };
			} catch {
				// non-fatal — leave the last known counts in place
			} finally {
				_unreadInflight = null;
			}
		})();
		return _unreadInflight;
	}

	/**
	 * Advance the read cursor for a channel and zero its badge optimistically.
	 * Pass the newest visible message id to anchor last_read_message.
	 */
	async function markRead(channelId: string, lastMessageId?: string | null) {
		if (!channelId) return;
		const existing = state.value.channels[channelId];
		if (existing?.count) {
			state.value = {
				channels: { ...state.value.channels, [channelId]: { count: 0, lastReadAt: new Date().toISOString() } },
				total: Math.max(0, state.value.total - existing.count),
			};
		}
		try {
			await $fetch(`/api/channels/${channelId}/read`, {
				method: 'POST',
				body: { last_read_message: lastMessageId || undefined },
			});
		} catch {
			// non-fatal — a later refresh reconciles
		}
	}

	const countFor = (channelId?: string | null) => (channelId ? state.value.channels[channelId]?.count || 0 : 0);
	const lastReadAtFor = (channelId?: string | null) => (channelId ? state.value.channels[channelId]?.lastReadAt || null : null);
	const total = computed(() => state.value.total);

	return { state, refresh, markRead, countFor, lastReadAtFor, total };
}
