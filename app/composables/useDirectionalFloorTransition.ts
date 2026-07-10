import type { MaybeRefOrGetter, Ref } from 'vue';

/**
 * useDirectionalFloorTransition — a nested version of
 * `useDirectionalPageTransition` for in-page "floor"/section tabs (Money,
 * Marketing, Organization, Account). It compares the active key's position in
 * an ordered list against its previous position and returns the matching
 * transition name so interior content slides forward/back exactly like the
 * main app-to-app page transition (`app-slide-forward` / `app-slide-back`,
 * defined in `assets/css/theme.css`). Off-list or first paint falls back to the
 * gentle `page-fade-up`.
 *
 * Usage:
 *   const floorTransition = useDirectionalFloorTransition(FLOOR_KEYS, floor);
 *   <Transition :name="floorTransition" mode="out-in">
 *     <div :key="floor"> …floor content… </div>
 *   </Transition>
 *
 * The watcher runs on the default 'pre' flush, so `name` updates before the
 * content re-renders and the leave/enter classes carry the right direction.
 */
export function useDirectionalFloorTransition(
	orderedKeys: MaybeRefOrGetter<readonly string[]>,
	active: Ref<string>,
): Ref<string> {
	const name = ref('page-fade-up');

	watch(active, (next, prev) => {
		const keys = toValue(orderedKeys);
		const ni = keys.indexOf(next);
		const pi = keys.indexOf(prev);
		if (ni === -1 || pi === -1 || ni === pi) {
			name.value = 'page-fade-up';
			return;
		}
		name.value = ni > pi ? 'app-slide-forward' : 'app-slide-back';
	});

	return name;
}
