// composables/useSidebarCollapsed.ts
// Manages sidebar collapsed/expanded state with localStorage persistence.
// Singleton pattern — shared across all composable instances.

const collapsed = ref(false);
const initialized = ref(false);

const STORAGE_KEY = 'sidebar-collapsed';

export function useSidebarCollapsed() {
	// Initialize from localStorage once on client
	if (import.meta.client && !initialized.value) {
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved === 'true') collapsed.value = true;
		} catch {}
		initialized.value = true;
	}

	const persist = () => {
		if (import.meta.client) {
			try {
				localStorage.setItem(STORAGE_KEY, String(collapsed.value));
			} catch {}
		}
	};

	const toggle = () => {
		collapsed.value = !collapsed.value;
		persist();
	};

	const expand = () => {
		collapsed.value = false;
		persist();
	};

	const collapse = () => {
		collapsed.value = true;
		persist();
	};

	return {
		collapsed: readonly(collapsed),
		toggle,
		expand,
		collapse,
	};
}
