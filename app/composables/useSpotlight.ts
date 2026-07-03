// Global spotlight-search open state. Shared so any chrome affordance — the
// header search button, the ⌘K shortcut, or the mobile user-menu entry — can
// drive the same modal. Module-scope ref (matches useTimeTrackerModal).
export const spotlightOpen = ref(false);

export function openSpotlight() {
	spotlightOpen.value = true;
}

export function closeSpotlight() {
	spotlightOpen.value = false;
}

export function toggleSpotlight() {
	spotlightOpen.value = !spotlightOpen.value;
}
