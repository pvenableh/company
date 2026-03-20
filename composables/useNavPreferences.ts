// composables/useNavPreferences.ts
// Manages user nav visibility and order preferences.
// Single source of truth for all app entries — used by NavDrawer, NavEditor, and CommandCenter AppGrid.
// Persists to Directus user profile (nav_preferences field) for cross-device consistency,
// with localStorage as immediate cache to avoid loading flicker.

export interface NavLink {
	name: string;
	type: string[];
	to: string;
	icon: string;
	color: string;
	description: string;
	section?: 'primary' | 'secondary' | 'tools';
}

const STORAGE_KEY = 'nav-preferences';

// Default link definitions — single source of truth for all navigation and app grid UIs
// Sections: primary = AI-powered core apps, secondary = supporting apps, tools = utilities
const DEFAULT_LINKS: NavLink[] = [
	// ── Command Center ──
	{
		name: 'Command Center',
		type: ['header', 'toolbar', 'drawer'],
		to: '/',
		icon: 'i-heroicons-command-line',
		color: 'bg-gradient-to-br from-violet-500 to-purple-600',
		description: 'AI productivity hub',
		section: 'primary',
	},
	// ── Primary AI Apps (toolbar + drawer) ──
	// Toolbar order: Command Center, Projects, Tickets | Earnest AI | People, Marketing, Menu
	{
		name: 'Projects',
		type: ['header', 'footer', 'toolbar', 'drawer'],
		to: '/projects',
		icon: 'i-heroicons-square-3-stack-3d',
		color: 'bg-purple-500',
		description: 'Track projects',
		section: 'primary',
	},
	{
		name: 'Tickets',
		type: ['header', 'footer', 'toolbar', 'drawer'],
		to: '/tickets',
		icon: 'i-heroicons-queue-list',
		color: 'bg-indigo-500',
		description: 'Support tickets',
		section: 'primary',
	},
	{
		name: 'People',
		type: ['footer', 'toolbar', 'drawer'],
		to: '/people',
		icon: 'i-heroicons-user-group',
		color: 'bg-gradient-to-br from-orange-400 to-red-500',
		description: 'Contacts, clients & networking',
		section: 'primary',
	},
	{
		name: 'Marketing',
		type: ['header', 'footer', 'toolbar', 'drawer'],
		to: '/marketing',
		icon: 'i-lucide-bar-chart-3',
		color: 'bg-gradient-to-br from-blue-500 to-cyan-500',
		description: 'AI marketing insights',
		section: 'primary',
	},
	{
		name: 'Teams',
		type: ['drawer'],
		to: '/organization/teams',
		icon: 'i-heroicons-user-group',
		color: 'bg-blue-500',
		description: 'Team management',
		section: 'secondary',
	},
	// ── Secondary Apps ──
	{
		name: 'Tasks',
		type: ['drawer'],
		to: '/tasks',
		icon: 'i-heroicons-clipboard-document-check',
		color: 'bg-blue-500',
		description: 'Manage your tasks',
		section: 'secondary',
	},
	{
		name: 'Invoices',
		type: ['header', 'footer', 'drawer'],
		to: '/invoices',
		icon: 'i-heroicons-document-text',
		color: 'bg-emerald-500',
		description: 'Billing & payments',
		section: 'secondary',
	},
	{
		name: 'Email',
		type: ['header', 'footer', 'drawer'],
		to: '/email',
		icon: 'i-heroicons-envelope',
		color: 'bg-rose-500',
		description: 'Campaigns & lists',
		section: 'secondary',
	},
	{
		name: 'Channels',
		type: ['header', 'footer', 'drawer'],
		to: '/channels',
		icon: 'i-heroicons-chat-bubble-left-right',
		color: 'bg-cyan-500',
		description: 'Team messaging',
		section: 'secondary',
	},
	{
		name: 'Social',
		type: ['header', 'footer', 'drawer'],
		to: '/social/dashboard',
		icon: 'i-heroicons-share',
		color: 'bg-pink-500',
		description: 'Social media',
		section: 'secondary',
	},
	// ── Tools ──
	{
		name: 'Time Tracker',
		type: ['header', 'footer', 'drawer'],
		to: '/time-tracker',
		icon: 'i-heroicons-clock',
		color: 'bg-lime-600',
		description: 'Track your time',
		section: 'tools',
	},
	{
		name: 'Files',
		type: ['header', 'footer', 'drawer'],
		to: '/files',
		icon: 'i-heroicons-folder-open',
		color: 'bg-sky-500',
		description: 'File manager',
		section: 'tools',
	},
	{
		name: 'Phone',
		type: ['drawer'],
		to: '/phone-settings',
		icon: 'i-heroicons-phone',
		color: 'bg-teal-500',
		description: 'Phone system',
		section: 'tools',
	},
	{
		name: 'Guide',
		type: ['drawer'],
		to: '/guide',
		icon: 'i-heroicons-book-open',
		color: 'bg-gradient-to-br from-cyan-500 to-blue-500',
		description: 'Setup tutorial',
		section: 'tools',
	},
	// ── AI Chat (distinct callout, not in grid) ──
	{
		name: 'AI Chat',
		type: ['drawer'],
		to: '/command-center/ai',
		icon: 'i-heroicons-sparkles',
		color: 'bg-gradient-to-br from-violet-500 to-purple-600',
		description: 'AI assistant',
	},
	// ── Settings-level items (drawer only) ──
	{
		name: 'Financials',
		type: ['footer', 'drawer'],
		to: '/financials',
		icon: 'i-heroicons-chart-bar',
		color: 'bg-green-600',
		description: 'Financial reports',
		section: 'secondary',
	},
	{
		name: 'Scheduler',
		type: ['header', 'footer', 'drawer'],
		to: '/scheduler',
		icon: 'i-heroicons-calendar-date-range',
		color: 'bg-amber-500',
		description: 'Book meetings',
		section: 'secondary',
	},
	{
		name: 'Organization',
		type: ['drawer'],
		to: '/organization',
		icon: 'i-heroicons-building-office-2',
		color: 'bg-gray-700',
		description: 'Organization settings',
		section: 'tools',
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
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useNavPreferences = () => {
	const { user } = useDirectusAuth();
	const { updateMe } = useDirectusUsers();

	const storageKey = computed(() => {
		const userId = user.value?.id || 'anonymous';
		return `${STORAGE_KEY}-${userId}`;
	});

	const applyPreferences = (parsed: NavPreferencesData) => {
		const allRoutes = DEFAULT_LINKS.map((l) => l.to);
		const newRoutes = allRoutes.filter((r) => !parsed.order.includes(r));
		const merged = [
			...parsed.order.filter((r) => allRoutes.includes(r)),
			...newRoutes,
		];
		order.value = merged;
		// Auto-show newly added links that weren't in the user's saved preferences
		visible.value = new Set([...parsed.visible, ...newRoutes]);
	};

	const load = () => {
		if (import.meta.server) return;
		try {
			// Try Directus user profile first
			const directusPrefs = user.value?.nav_preferences as NavPreferencesData | null;
			if (directusPrefs?.visible && directusPrefs?.order) {
				applyPreferences(directusPrefs);
				// Sync to localStorage as cache
				localStorage.setItem(storageKey.value, JSON.stringify(directusPrefs));
			} else {
				// Fall back to localStorage
				const saved = localStorage.getItem(storageKey.value);
				if (saved) {
					const parsed = JSON.parse(saved) as NavPreferencesData;
					applyPreferences(parsed);
				} else {
					// Defaults
					visible.value = new Set(DEFAULT_LINKS.map((l) => l.to));
					order.value = DEFAULT_LINKS.map((l) => l.to);
				}
			}
		} catch {
			visible.value = new Set(DEFAULT_LINKS.map((l) => l.to));
			order.value = DEFAULT_LINKS.map((l) => l.to);
		}
		isLoaded.value = true;
	};

	const save = () => {
		if (import.meta.server) return;
		const data: NavPreferencesData = {
			visible: [...visible.value],
			order: order.value,
		};
		// Save to localStorage immediately (cache)
		try {
			localStorage.setItem(storageKey.value, JSON.stringify(data));
		} catch {}
		// Debounce Directus save to avoid hammering the API during rapid reordering
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			if (user.value?.id) {
				updateMe({ nav_preferences: data }).catch(() => {});
			}
		}, 500);
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
