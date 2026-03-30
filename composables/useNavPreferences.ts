// composables/useNavPreferences.ts
// Manages user nav visibility and order preferences.
// Single source of truth for all app entries — used by NavDrawer, NavEditor, and CommandCenter AppGrid.
// Persists to Directus user profile (nav_preferences field) for cross-device consistency,
// with localStorage as immediate cache to avoid loading flicker.

import type { FeatureKey } from '~/types/permissions';

export interface NavLink {
	name: string;
	type: string[];
	to: string;
	icon: string;
	color: string;
	description: string;
	section?: 'primary' | 'secondary' | 'tools';
	featureKey?: FeatureKey;
}

const STORAGE_KEY = 'nav-preferences';

// Default link definitions — single source of truth for all navigation and app grid UIs
// Sections: primary = core work apps (sidebar top), secondary = more apps (sidebar bottom)
// All links appear in Command Center grid and Cmd+K spotlight regardless of sidebar visibility.
const DEFAULT_LINKS: NavLink[] = [
	// ── Core (sidebar top — no section label) ──
	{ name: 'Command Center', type: ['header', 'toolbar', 'drawer'], to: '/', icon: 'i-heroicons-command-line', color: 'bg-gradient-to-br from-violet-500 to-purple-600', description: 'AI productivity hub', section: 'primary' },
	{ name: 'Projects', type: ['header', 'footer', 'toolbar', 'drawer'], to: '/projects', icon: 'i-heroicons-square-3-stack-3d', color: 'bg-purple-500', description: 'Track projects', section: 'primary', featureKey: 'projects' },
	{ name: 'People', type: ['footer', 'toolbar', 'drawer'], to: '/people', icon: 'i-heroicons-user-group', color: 'bg-gradient-to-br from-orange-400 to-red-500', description: 'Contacts & clients', section: 'primary', featureKey: 'people' },
	{ name: 'Leads', type: ['header', 'footer', 'drawer'], to: '/leads', icon: 'i-heroicons-funnel', color: 'bg-gradient-to-br from-amber-500 to-orange-500', description: 'Lead pipeline', section: 'primary', featureKey: 'leads' },
	{ name: 'Proposals', type: ['header', 'footer', 'drawer'], to: '/proposals', icon: 'i-heroicons-document-check', color: 'bg-gradient-to-br from-teal-500 to-emerald-500', description: 'Proposals & estimates', section: 'primary', featureKey: 'proposals' },
	{ name: 'Invoices', type: ['header', 'footer', 'drawer'], to: '/invoices', icon: 'i-heroicons-document-text', color: 'bg-emerald-500', description: 'Billing & payments', section: 'primary', featureKey: 'invoices' },
	{ name: 'Marketing', type: ['header', 'footer', 'toolbar', 'drawer'], to: '/marketing', icon: 'i-lucide-bar-chart-3', color: 'bg-gradient-to-br from-blue-500 to-cyan-500', description: 'Campaigns & insights', section: 'primary', featureKey: 'email_campaigns' },
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
	{ name: 'Email', type: ['header', 'footer', 'drawer'], to: '/email', icon: 'i-heroicons-envelope', color: 'bg-rose-500', description: 'Email campaigns', section: 'secondary', featureKey: 'email_campaigns' },
	{ name: 'Social', type: ['header', 'footer', 'drawer'], to: '/social/dashboard', icon: 'i-heroicons-share', color: 'bg-pink-500', description: 'Social media', section: 'secondary', featureKey: 'email_campaigns' },
	{ name: 'Financials', type: ['footer', 'drawer'], to: '/financials', icon: 'i-heroicons-chart-bar', color: 'bg-green-600', description: 'Financial reports', section: 'secondary', featureKey: 'invoices' },
	{ name: 'Time Tracker', type: ['header', 'footer', 'drawer'], to: '/time-tracker', icon: 'i-heroicons-clock', color: 'bg-lime-600', description: 'Track time', section: 'secondary' },
	{ name: 'Phone', type: ['drawer'], to: '/phone-settings', icon: 'i-heroicons-phone', color: 'bg-teal-500', description: 'Phone system', section: 'secondary' },
	{ name: 'Guide', type: ['drawer'], to: '/guide', icon: 'i-heroicons-book-open', color: 'bg-gradient-to-br from-cyan-500 to-blue-500', description: 'Setup tutorial', section: 'secondary' },
	{ name: 'AI Chat', type: ['drawer'], to: '/command-center/ai', icon: 'i-heroicons-sparkles', color: 'bg-gradient-to-br from-violet-500 to-purple-600', description: 'AI assistant' },
	{ name: 'Organization', type: ['drawer'], to: '/organization', icon: 'i-heroicons-building-office-2', color: 'bg-gray-700', description: 'Settings', section: 'secondary', featureKey: 'org_settings' },
];

// Default sidebar visibility — first 9 items (Command Center + 4 primary + 4 secondary)
const DEFAULT_VISIBLE_ROUTES = new Set(DEFAULT_LINKS.slice(0, 10).map(l => l.to));

// ── Hats ────────────────────────────────────────────────────────────────────
// Hats are workspace presets that pre-fill sidebar visibility.
// Switching hats resets visible apps to the hat's set. User can still
// tweak individual apps via Edit Apps — those tweaks persist until the
// next hat switch.

export interface Hat {
	id: string;
	icon: string;
	name: string;
	description: string;
	/** Routes included when this hat is active (always includes '/') */
	routes: string[];
}

const HATS: Hat[] = [
	{
		id: 'everything',
		icon: 'i-fluent-emoji-flat-comet',
		name: 'Everything',
		description: 'Full workspace — all your apps',
		routes: [...DEFAULT_VISIBLE_ROUTES],
	},
	{
		id: 'creative',
		icon: 'i-fluent-emoji-flat-artist-palette',
		name: 'Creative',
		description: 'Design, content & brand work',
		routes: ['/', '/projects', '/marketing', '/social/dashboard', '/files'],
	},
	{
		id: 'finance',
		icon: 'i-fluent-emoji-flat-money-bag',
		name: 'Finance',
		description: 'Billing, reports & time tracking',
		routes: ['/', '/invoices', '/financials', '/time-tracker', '/people'],
	},
	{
		id: 'manager',
		icon: 'i-fluent-emoji-flat-necktie',
		name: 'Manager',
		description: 'Teams, tickets, tasks & scheduling',
		routes: ['/', '/projects', '/tickets', '/tasks', '/organization/teams', '/scheduler', '/channels', '/activity'],
	},
	{
		id: 'marketing',
		icon: 'i-fluent-emoji-flat-bullseye',
		name: 'Marketing',
		description: 'Campaigns, social & outreach',
		routes: ['/', '/marketing', '/email', '/social/dashboard', '/people', '/scheduler'],
	},
	{
		id: 'sales',
		icon: 'i-fluent-emoji-flat-rocket',
		name: 'Sales',
		description: 'Leads, proposals, invoicing & meetings',
		routes: ['/', '/leads', '/proposals', '/people', '/invoices', '/scheduler', '/channels', '/email'],
	},
	{
		id: 'focus',
		icon: 'i-fluent-emoji-flat-headphone',
		name: 'Focus',
		description: 'Deep work — minimal distractions',
		routes: ['/', '/projects', '/tasks', '/channels'],
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
const activeHatId = ref<string>('everything');
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

	/** Switch hat — resets visible apps to the hat's preset routes. */
	const setHat = (hatId: string) => {
		const hat = HATS.find(h => h.id === hatId);
		if (!hat) return;
		activeHatId.value = hatId;
		visible.value = new Set(hat.routes);
		// Reorder: hat routes first (in hat order), then everything else
		const allRoutes = DEFAULT_LINKS.map(l => l.to);
		const rest = allRoutes.filter(r => !hat.routes.includes(r));
		order.value = [...hat.routes, ...rest];
		save();
	};

	/** The currently active hat object. */
	const activeHat = computed<Hat>(() =>
		HATS.find(h => h.id === activeHatId.value) || HATS[0],
	);

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
		activeHatId.value = 'everything';
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
	};
};
