export const timeTrackerModalOpen = ref(false);

export function openTimeTrackerModal() {
	timeTrackerModalOpen.value = true;
}

export function closeTimeTrackerModal() {
	timeTrackerModalOpen.value = false;
}
