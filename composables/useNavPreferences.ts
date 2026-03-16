// composables/useNavPreferences.ts
// Manages user nav visibility and order preferences.
// Persists to localStorage per-user so each team member can customize
// which nav items they see and in what order.

export interface NavLink {
	name: string;
	type: string[];
	to: string;
	icon: string;
}

const STORAGE_KEY = 'nav-preferences';

// Default link definitions — single source of truth
const DEFAULT_LINKS: NavLink[] = [
	{
		name: 'Command Center',
		type: ['header', 'footer', 'toolbar', 'drawer'],
		to: '/',
		icon: 'i-heroicons-sparkles',
	},
	{
		name: 'Statistics',
		type: ['footer', 'drawer'],
		to: '/dashboard',
		icon: 'i-heroicons-squares-2x2',
	},
	{
		name: 'Tickets',
		type: ['header', 'footer', 'toolbar', 'drawer'],
		to: '/tickets',
		icon: 'i-heroicons-queue-list',
	},
	{
		name: 'Projects',
		type: ['header', 'footer', 'toolbar', 'drawer'],
		to: '/projects',
		icon: 'i-heroicons-square-3-stack-3d',
	},
	{
		name: 'Scheduler',
		type: ['header', 'footer', 'drawer'],
		to: '/scheduler',
		icon: 'i-heroicons-calendar-date-range',
	},
	{
		name: 'Channels',
		type: ['header', 'footer', 'drawer'],
		to: '/channels',
		icon: 'i-heroicons-square-3-stack-3d',
	},
	{
		name: 'Invoices',
		type: ['header', 'footer', 'toolbar', 'drawer'],
		to: '/invoices',
		icon: 'i-heroicons-document-text',
	},
	{
		name: 'Time Tracker',
		type: ['header', 'footer', 'drawer'],
		to: '/time-tracker',
		icon: 'i-heroicons-clock',
	},
	{
		name: 'Social',
		type: ['header', 'footer', 'drawer'],
		to: '/social/dashboard',
		icon: 'i-heroicons-share',
	},
	{
		name: 'Email',
		type: ['header', 'footer', 'drawer'],
		to: '/email',
		icon: 'i-heroicons-envelope',
	},
	{
		name: 'Financials',
		type: ['footer', 'toolbar', 'drawer'],
		to: '/financials',
		icon: 'i-heroicons-banknotes',
	},
	{
		name: 'Contacts',
		type: ['footer', 'drawer'],
		to: '/contacts',
		icon: 'i-heroicons-user-group',
	},
	{
		name: 'Clients',
		type: ['footer', 'drawer'],
		to: '/clients',
		icon: 'i-heroicons-building-office-2',
	},
	{
		name: 'Teams',
		type: ['header', 'footer', 'drawer'],
		to: '/organization/teams',
		icon: 'i-heroicons-user-group',
	},
	{
		name: 'Files',
		type: ['header', 'footer', 'drawer'],
		to: '/files',
		icon: 'i-heroicons-folder',
	},
];

interface NavPreferencesData {
	visible: string[];
	order: string[];
}

// Shared reactive state (singleton across components)
const visible = ref<Set<string>>(new Set(DEFAULT_LINKS.map((l) => l.to)));
const order = ref<string[]>(DEFAULT_LINKS.map((l) => l.to));
const isLoaded = ref(false);

export const useNavPreferences = () => {
	const { user } = useDirectusAuth();

	const storageKey = computed(() => {
		const userId = user.value?.id || 'anonymous';
		return `${STORAGE_KEY}-${userId}`;
	});

	const load = () => {
		if (import.meta.server) return;
		try {
			const saved = localStorage.getItem(storageKey.value);
			if (saved) {
				const parsed = JSON.parse(saved) as NavPreferencesData;
				visible.value = new Set(parsed.visible);
				// Merge: saved order first, then any new links not in saved order
				const allRoutes = DEFAULT_LINKS.map((l) => l.to);
				const merged = [
					...parsed.order.filter((r) => allRoutes.includes(r)),
					...allRoutes.filter((r) => !parsed.order.includes(r)),
				];
				order.value = merged;
			} else {
				// Defaults
				visible.value = new Set(DEFAULT_LINKS.map((l) => l.to));
				order.value = DEFAULT_LINKS.map((l) => l.to);
			}
		} catch {
			visible.value = new Set(DEFAULT_LINKS.map((l) => l.to));
			order.value = DEFAULT_LINKS.map((l) => l.to);
		}
		isLoaded.value = true;
	};

	const save = () => {
		if (import.meta.server) return;
		try {
			const data: NavPreferencesData = {
				visible: [...visible.value],
				order: order.value,
			};
			localStorage.setItem(storageKey.value, JSON.stringify(data));
		} catch {}
	};

	const toggle = (route: string) => {
		const set = new Set(visible.value);
		if (set.has(route)) {
			set.delete(route);
		} else {
			set.add(route);
		}
		visible.value = set;
		save();
	};

	const reorder = (newOrder: string[]) => {
		order.value = newOrder;
		save();
	};

	const resetToDefault = () => {
		visible.value = new Set(DEFAULT_LINKS.map((l) => l.to));
		order.value = DEFAULT_LINKS.map((l) => l.to);
		save();
	};

	const isVisible = (route: string) => visible.value.has(route);

	// All links sorted by user order
	const allLinks = computed<NavLink[]>(() => {
		const linkMap = new Map(DEFAULT_LINKS.map((l) => [l.to, l]));
		return order.value.map((route) => linkMap.get(route)!).filter(Boolean);
	});

	// Only visible links sorted by user order
	const visibleLinks = computed<NavLink[]>(() => {
		return allLinks.value.filter((l) => visible.value.has(l.to));
	});

	// Load on init
	if (!isLoaded.value) {
		load();
	}

	// Reload when user changes
	watch(storageKey, () => load());

	return {
		defaultLinks: DEFAULT_LINKS,
		allLinks,
		visibleLinks,
		visible: readonly(visible),
		order: readonly(order),
		toggle,
		reorder,
		resetToDefault,
		isVisible,
	};
};
