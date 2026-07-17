/**
 * usePinnable — pin-to-top toggle for any collection carrying a boolean
 * `pinned` field (projects, clients; mirrors cd_contacts.pinned). Optimistic:
 * flips the row's `pinned` in place, persists, and rolls back on failure.
 *
 * Pair with `sortPinnedFirst()` to keep pinned rows at the head of a list that
 * is otherwise sorted by activity.
 */
export function usePinnable(collection: string) {
	const items = useDirectusItems(collection);
	const toast = useToast();

	async function togglePin(row: { id: string | number; pinned?: boolean } | null | undefined) {
		if (!row?.id) return false;
		const next = !row.pinned;
		row.pinned = next; // optimistic
		try {
			await items.update(String(row.id), { pinned: next });
			return true;
		} catch (err: any) {
			row.pinned = !next; // rollback
			toast.add({
				title: 'Could not update pin',
				description: err?.data?.message || err?.message || undefined,
				color: 'red',
			});
			return false;
		}
	}

	return { togglePin };
}

/**
 * Stable-sort a list so pinned rows come first, preserving the existing
 * (activity) order within each group. Returns a new array.
 */
export function sortPinnedFirst<T extends { pinned?: boolean }>(list: T[]): T[] {
	return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
}
