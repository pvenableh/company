export const timeTrackerModalOpen = ref(false);

// Global dock panel state (used by FloatingDock and external triggers)
export const activeDockPanel = ref<'tasks' | 'timer' | null>(null);

export function openTimeTrackerModal() {
	timeTrackerModalOpen.value = true;
}

export function closeTimeTrackerModal() {
	timeTrackerModalOpen.value = false;
}

export function openTimerDockPanel() {
	activeDockPanel.value = 'timer';
}

export function closeTimerDockPanel() {
	activeDockPanel.value = null;
}

export function toggleDockPanel(panel: 'tasks' | 'timer') {
	activeDockPanel.value = activeDockPanel.value === panel ? null : panel;
}
