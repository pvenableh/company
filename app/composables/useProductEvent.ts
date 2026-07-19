// composables/useProductEvent.ts
//
// Fire-and-forget product-usage tracking → `product_events` (see
// server/api/telemetry/event.post.ts). Deliberately tiny and generic: a
// namespaced `event` slug + a small `props` blob, so any surface can log a
// signal without new infra. Never throws, never blocks the UI — a dropped
// event is always better than a broken interaction.
//
// Usage:
//   const { track } = useProductEvent();
//   track('home.mode_flipped', { props: { from: 'presence', to: 'classic' } });

export interface TrackOpts {
	/** UI surface, e.g. 'presence-home'. */
	source?: string;
	/** Small payload; capped server-side. */
	props?: Record<string, unknown>;
}

export function useProductEvent() {
	const { selectedOrg } = useOrganization();

	function track(event: string, opts: TrackOpts = {}) {
		if (import.meta.server) return;
		const organization = typeof selectedOrg.value === 'string'
			? selectedOrg.value
			: (selectedOrg.value as { id?: string } | null)?.id;
		// Fire-and-forget: swallow everything (offline, 4xx, auth) — telemetry
		// must never surface an error or delay the interaction it's measuring.
		$fetch('/api/telemetry/event', {
			method: 'POST',
			body: { event, source: opts.source, organization: organization || undefined, props: opts.props },
		}).catch(() => {});
	}

	return { track };
}
