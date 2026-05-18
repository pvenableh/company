/**
 * useDataScope — global "Mine vs. Everyone" lens.
 *
 * One ref shared across the apps shell. Consumer lists (tasks, projects,
 * leads, contacts, tickets, time entries, …) read `scope.value` and apply
 * an `assignee/owner === me` predicate to their results when it's `'mine'`.
 *
 * Default is `'mine'` — users mostly care about their own work. Org
 * admins/owners can flip to `'all'`; everyone else is locked to `'mine'`
 * to keep the toggle from suggesting access they don't actually have.
 *
 * Persists per-user in localStorage so the choice survives reloads, and
 * resets to `'mine'` if the active user changes (avoids accidental
 * cross-account scope bleed when accounts switch on the same browser).
 */

export type DataScope = 'mine' | 'all';

const STORAGE_PREFIX = 'earnest:data-scope:';

function storageKey(userId: string | null | undefined) {
	return userId ? `${STORAGE_PREFIX}${userId}` : `${STORAGE_PREFIX}anon`;
}

export function useDataScope() {
	const { user } = useDirectusAuth();
	const { isOrgAdminOrAbove } = useOrgRole();

	const scope = useState<DataScope>('data-scope', () => 'mine');
	const hydrated = useState<boolean>('data-scope-hydrated', () => false);

	// Hydrate from localStorage once on the client. SSR keeps the default
	// so the first render stays deterministic.
	if (import.meta.client && !hydrated.value) {
		hydrated.value = true;
		try {
			const uid = (user.value as any)?.id ?? null;
			const raw = localStorage.getItem(storageKey(uid));
			if (raw === 'all' || raw === 'mine') {
				scope.value = raw;
			}
		} catch {
			/* localStorage may be disabled — ignore */
		}
	}

	// Reset to mine when the user changes (avoids leaking a prior user's
	// "all" preference into a new login on the same browser).
	if (import.meta.client) {
		watch(
			() => (user.value as any)?.id ?? null,
			(uid, prev) => {
				if (uid === prev) return;
				try {
					const raw = localStorage.getItem(storageKey(uid));
					scope.value = raw === 'all' || raw === 'mine' ? raw : 'mine';
				} catch {
					scope.value = 'mine';
				}
			},
		);
	}

	// Non-admins can't actually choose "all" — clamp defensively in case a
	// stale localStorage value gets unsealed when the role changes.
	const effectiveScope = computed<DataScope>(() => {
		if (!isOrgAdminOrAbove.value) return 'mine';
		return scope.value;
	});

	const isMine = computed(() => effectiveScope.value === 'mine');
	const canChooseAll = computed(() => isOrgAdminOrAbove.value);

	function setScope(next: DataScope) {
		if (next === 'all' && !canChooseAll.value) return;
		scope.value = next;
		if (import.meta.client) {
			try {
				const uid = (user.value as any)?.id ?? null;
				localStorage.setItem(storageKey(uid), next);
			} catch {
				/* ignore */
			}
		}
	}

	function toggle() {
		setScope(effectiveScope.value === 'mine' ? 'all' : 'mine');
	}

	return {
		scope: effectiveScope,
		isMine,
		canChooseAll,
		setScope,
		toggle,
	};
}
