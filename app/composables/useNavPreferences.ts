// composables/useNavPreferences.ts
// Manages user nav visibility and order preferences.
// Single source of truth for all app entries — used by NavDrawer, NavEditor, and CommandCenter AppGrid.
// Persists to Directus user profile (nav_preferences field) for cross-device consistency,
// with localStorage as immediate cache to avoid loading flicker.

import type { FeatureKey } from '~~/shared/permissions';

export interface NavLink {
	name: string;
	type: string[];
	to: string;
	icon: string;
	color: string;
	description: string;
	section?: 'primary' | 'secondary' | 'tools';
	/** When set, the link is rendered inside a collapsible sidebar group instead of its `section` list. */
	group?: 'engage';
	featureKey?: FeatureKey;
}

const STORAGE_KEY = 'nav-preferences';

// Default link definitions — single source of truth for all navigation and app grid UIs
// Sections: primary = core work apps (sidebar top), secondary = more apps (sidebar bottom)
// All links appear in Command Center grid and Cmd+K spotlight regardless of sidebar visibility.
const DEFAULT_LINKS: NavLink[] = [
	// ── Core (sidebar top — no section label) ──
	{ name: 'Command Center', type: ['header', 'toolbar', 'drawer'], to: '/', icon: 'i-heroicons-command-line', color: 'bg-gradient-to-br from-violet-500 to-purple-600', description: 'Productivity hub', section: 'primary' },
	{ name: 'Projects', type: ['header', 'footer', 'toolbar', 'drawer'], to: '/projects', icon: 'i-heroicons-square-3-stack-3d', color: 'bg-purple-500', description: 'Track projects', section: 'primary', featureKey: 'projects' },
	{ name: 'Contacts', type: ['footer', 'toolbar', 'drawer'], to: '/contacts', icon: 'i-heroicons-identification', color: 'bg-gradient-to-br from-orange-400 to-red-500', description: 'Contacts list & insights', section: 'primary', featureKey: 'people' },
	{ name: 'Clients', type: ['header', 'footer', 'drawer'], to: '/clients', icon: 'i-heroicons-building-storefront', color: 'bg-gradient-to-br from-sky-500 to-blue-600', description: 'Client accounts', section: 'primary' },
	{ name: 'Leads', type: ['header', 'footer', 'drawer'], to: '/leads', icon: 'i-heroicons-funnel', color: 'bg-gradient-to-br from-amber-500 to-orange-500', description: 'Lead pipeline', section: 'primary', featureKey: 'leads' },
	{ name: 'Proposals', type: ['header', 'footer', 'drawer'], to: '/proposals', icon: 'i-heroicons-document-check', color: 'bg-gradient-to-br from-teal-500 to-emerald-500', description: 'Proposals & estimates', section: 'primary', featureKey: 'proposals' },
	{ name: 'Contracts', type: ['header', 'footer', 'drawer'], to: '/contracts', icon: 'i-heroicons-document-arrow-down', color: 'bg-gradient-to-br from-sky-500 to-blue-600', description: 'Contracts & signing', section: 'secondary', featureKey: 'proposals' },
	{ name: 'Invoices', type: ['header', 'footer', 'drawer'], to: '/invoices', icon: 'i-heroicons-document-text', color: 'bg-emerald-500', description: 'Billing & payments', section: 'primary', featureKey: 'invoices' },
	{ name: 'Marketing', type: ['header', 'footer', 'toolbar', 'drawer'], to: '/marketing', icon: 'i-lucide-bar-chart-3', color: 'bg-gradient-to-br from-blue-500 to-cyan-500', description: 'Campaigns, recommendations & insights', section: 'primary', group: 'engage', featureKey: 'email_campaigns' },
	// ── More (sidebar bottom — subtle "More" divider) ──
	{ name: 'Activity', type: ['header', 'footer', 'drawer'], to: '/activity', icon: 'i-heroicons-clock', color: 'bg-violet-500', description: 'Activity timeline', section: 'secondary' },
	{ name: 'Channels', type: ['header', 'footer', 'drawer'], to: '/channels', icon: 'i-heroicons-chat-bubble-left-right', color: 'bg-cyan-500', description: 'Team messaging', section: 'secondary', featureKey: 'channels' },
	{ name: 'Scheduler', type: ['header', 'footer', 'drawer'], to: '/scheduler', icon: 'i-heroicons-calendar-date-range', color: 'bg-amber-500', description: 'Book meetings', section: 'secondary', featureKey: 'appointments' },
	{ name: 'Tasks', type: ['drawer'], to: '/tasks', icon: 'i-heroicons-clipboard-document-check', color: 'bg-blue-500', description: 'Manage tasks', section: 'secondary', featureKey: 'tasks' },
	{ name: 'Files', type: ['header', 'footer', 'drawer'], to: '/files', icon: 'i-heroicons-folder-open', color: 'bg-sky-500', description: 'File manager', section: 'secondary' },
	// ── Everything below starts HIDDEN from sidebar — accessible via Command Center grid + Cmd+K ──
	{ name: 'Tickets', type: ['header', 'footer', 'toolbar', 'drawer'], to: '/tickets', icon: 'i-heroicons-queue-list', color: 'bg-indigo-500', description: 'Support tickets', section: 'secondary', featureKey: 'tickets' },
	{ name: 'Teams', type: ['drawer'], to: '/organization/teams', icon: 'i-heroicons-user-group', color: 'bg-blue-500', description: 'Team management', section: 'secondary', featureKey: 'team_management' },
	{ name: 'Goals', type: ['drawer'], to: '/goals', icon: 'i-heroicons-flag', color: 'bg-amber-500', description: 'Track goals', section: 'secondary' },
	{ name: 'Email', type: ['header', 'footer', 'drawer'], to: '/email', icon: 'i-heroicons-envelope', color: 'bg-rose-500', description: 'Email campaigns', section: 'secondary', group: 'engage', featureKey: 'email_campaigns' },
	{ name: 'Social', type: ['header', 'footer', 'drawer'], to: '/social', icon: 'i-heroicons-share', color: 'bg-pink-500', description: 'Social media', section: 'secondary', group: 'engage', featureKey: 'email_campaigns' },
	{ name: 'Expenses', type: ['header', 'footer', 'drawer'], to: '/expenses', icon: 'i-lucide-receipt', color: 'bg-orange-500', description: 'Track expenses', section: 'secondary', featureKey: 'invoices' },
	{ name: 'Billing', type: ['header', 'footer', 'drawer'], to: '/apps/money?floor=deposits', icon: 'i-lucide-banknote', color: 'bg-teal-600', description: 'Transactions, refunds, balance, payouts', section: 'secondary', featureKey: 'invoices' },
	{ name: 'Financials', type: ['footer', 'drawer'], to: '/financials', icon: 'i-heroicons-chart-bar', color: 'bg-green-600', description: 'Financial reports', section: 'secondary', featureKey: 'invoices' },
	{ name: 'Time Tracker', type: ['header', 'footer', 'drawer'], to: '/apps/work?floor=time', icon: 'i-heroicons-clock', color: 'bg-lime-600', description: 'Track time', section: 'secondary' },
	{ name: 'Phone', type: ['drawer'], to: '/phone-settings', icon: 'i-heroicons-phone', color: 'bg-teal-500', description: 'Phone system', section: 'secondary' },
	{ name: 'Guide', type: ['drawer'], to: '/guide', icon: 'i-heroicons-book-open', color: 'bg-gradient-to-br from-cyan-500 to-blue-500', description: 'Setup tutorial', section: 'secondary' },
	{ name: 'Chat', type: ['drawer'], to: '/command-center/ai', icon: 'i-heroicons-sparkles', color: 'bg-gradient-to-br from-violet-500 to-purple-600', description: 'Earnest assistant' },
	{ name: 'Organization', type: ['drawer'], to: '/apps/organization', icon: 'i-heroicons-building-office-2', color: 'bg-gray-700', description: 'Settings', section: 'secondary', featureKey: 'org_settings' },
];

// Default sidebar visibility — first 10 items (Command Center + work apps + Marketing + Activity)
// plus the rest of the Engage group so the collapsible section has all 3 children out of the box.
const DEFAULT_VISIBLE_ROUTES = new Set([
	...DEFAULT_LINKS.slice(0, 10).map(l => l.to),
	'/email',
	'/social',
]);

// ── Hats (deprecated) ───────────────────────────────────────────────────────
// Hats were workspace presets that pre-filled sidebar visibility. Apps Mode
// now plays the role-shaped role, so hats are deprecated and the API is
// frozen to a single Default hat. The exports below remain for one release
// so persisted Directus prefs and any lingering imports don't crash; a
// future cleanup can drop them entirely.

export interface Hat {
	id: string;
	icon: string;
	name: string;
	description: string;
	/** Routes included when this hat is active (always includes '/') */
	routes: string[];
}

const DEFAULT_HAT: Hat = {
	id: 'default',
	icon: 'i-fluent-emoji-flat-comet',
	name: 'Default',
	description: 'Full workspace — all your apps',
	routes: [...DEFAULT_VISIBLE_ROUTES],
};

const HATS: Hat[] = [
	DEFAULT_HAT,
	{
		id: 'project_manager',
		icon: 'i-fluent-emoji-flat-clipboard',
		name: 'Project Manager',
		description: 'Projects, tickets, tasks & scheduling',
		routes: ['/', '/projects', '/tickets', '/tasks', '/scheduler', '/channels', '/activity', '/contacts'],
	},
	{
		id: 'accountant',
		icon: 'i-fluent-emoji-flat-money-bag',
		name: 'Accountant',
		description: 'Invoices, contracts, expenses & reports',
		routes: ['/', '/invoices', '/contracts', '/expenses', '/financials', '/apps/work?floor=time', '/contacts', '/apps/money?floor=deposits'],
	},
	{
		id: 'salesman',
		icon: 'i-fluent-emoji-flat-rocket',
		name: 'Salesman',
		description: 'Leads, proposals, CRM & outreach',
		routes: ['/', '/leads', '/proposals', '/clients', '/contacts', '/contracts', '/scheduler', '/email'],
	},
	{
		id: 'marketing_manager',
		icon: 'i-fluent-emoji-flat-bullseye',
		name: 'Marketing Manager',
		description: 'Campaigns, social, email & insights',
		routes: ['/', '/marketing', '/social', '/email', '/contacts', '/scheduler'],
	},
];

const HAT_STORAGE_KEY = 'earnest-active-hat';

interface NavPreferencesData {
	visible: string[];
	order: string[];
	activeHat?: string;
}

// Shared reactive state (singleton across components)
const visible = ref<Set<string>>(new Set(DEFAULT_VISIBLE_ROUTES));
const order = ref<string[]>(DEFAULT_LINKS.map((l) => l.to));
const activeHatId = ref<string>('default');
const isLoaded = ref(false);
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useNavPreferences = () => {
	const { user } = useDirectusAuth();
	const { updateMe } = useDirectusUsers();
	// Lazy-init: only resolve useOrgRole when user is authenticated
	let _orgRole: ReturnType<typeof useOrgRole> | null = null;
	const getOrgRole = () => {
		if (!_orgRole && user.value) _orgRole = useOrgRole();
		return _orgRole;
	};

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
			// Restore active hat
			const savedHat = localStorage.getItem(HAT_STORAGE_KEY);
			if (savedHat && HATS.some(h => h.id === savedHat)) {
				activeHatId.value = savedHat;
			}

			// Try Directus user profile first
			const directusPrefs = user.value?.nav_preferences as NavPreferencesData | null;
			if (directusPrefs?.visible && directusPrefs?.order) {
				applyPreferences(directusPrefs);
				if (directusPrefs.activeHat && HATS.some(h => h.id === directusPrefs.activeHat)) {
					activeHatId.value = directusPrefs.activeHat!;
				}
				localStorage.setItem(storageKey.value, JSON.stringify(directusPrefs));
			} else {
				const saved = localStorage.getItem(storageKey.value);
				if (saved) {
					const parsed = JSON.parse(saved) as NavPreferencesData;
					applyPreferences(parsed);
					if (parsed.activeHat && HATS.some(h => h.id === parsed.activeHat)) {
						activeHatId.value = parsed.activeHat!;
					}
				} else {
					visible.value = new Set(DEFAULT_VISIBLE_ROUTES);
					order.value = DEFAULT_LINKS.map((l) => l.to);
				}
			}
		} catch {
			visible.value = new Set(DEFAULT_VISIBLE_ROUTES);
			order.value = DEFAULT_LINKS.map((l) => l.to);
		}
		isLoaded.value = true;
	};

	const save = () => {
		if (import.meta.server) return;
		const data: NavPreferencesData = {
			visible: [...visible.value],
			order: order.value,
			activeHat: activeHatId.value,
		};
		try {
			localStorage.setItem(storageKey.value, JSON.stringify(data));
			localStorage.setItem(HAT_STORAGE_KEY, activeHatId.value);
		} catch {}
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			if (user.value?.id) {
				updateMe({ nav_preferences: data }).catch(() => {});
			}
		}, 500);
	};

	const setHat = (hatId: string) => {
		if (!HATS.some(h => h.id === hatId)) return;
		activeHatId.value = hatId;
		save();
	};

	/** Stays a no-op — hats are an explicit user choice, not derived. */
	const applySmartDefaultHat = () => {};

	const activeHat = computed<Hat>(() => {
		return HATS.find(h => h.id === activeHatId.value) ?? DEFAULT_HAT;
	});

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
		activeHatId.value = 'default';
		visible.value = new Set(DEFAULT_VISIBLE_ROUTES);
		order.value = DEFAULT_LINKS.map((l) => l.to);
		save();
	};

	const isVisible = (route: string) => visible.value.has(route);

	/** Check if a link is blocked by the user's org role permissions */
	const isGatedByRole = (link: NavLink): boolean => {
		if (!link.featureKey) return false;
		const role = getOrgRole();
		if (!role) return false;
		return !role.canAccess(link.featureKey);
	};

	// All links sorted by user order
	const allLinks = computed<NavLink[]>(() => {
		const linkMap = new Map(DEFAULT_LINKS.map((l) => [l.to, l]));
		return order.value.map((route) => linkMap.get(route)!).filter(Boolean);
	});

	// Only visible links sorted by user order, filtered by org role permissions
	const visibleLinks = computed<NavLink[]>(() => {
		const role = getOrgRole();
		return allLinks.value.filter((l) => {
			if (!visible.value.has(l.to)) return false;
			// Only apply role-based gating when logged in
			if (role && l.featureKey && !role.canAccess(l.featureKey)) return false;
			return true;
		});
	});

	// Load on init
	if (!isLoaded.value) {
		load();
	}

	// Reload when user changes; clear pending saves and cached role on logout
	watch(storageKey, () => {
		if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
		_orgRole = null;
		load();
	});

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
		isGatedByRole,
		// Hats
		hats: HATS,
		activeHat,
		setHat,
		applySmartDefaultHat,
	};
};
