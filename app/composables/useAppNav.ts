/**
 * useAppNav — single source of truth for the app + in-app-section (floor)
 * navigation model.
 *
 * Two nav levels share this model so they never drift:
 *   1. Top-level apps — order + metadata (icon / label / route) come from
 *      `APP_META` via `useAppAccent` (`APP_ORDER` + footer). This composable
 *      re-exposes them as plain `{ id, name, icon, to }` nav items.
 *   2. Per-app floors — the in-page sections each app renders as a pill
 *      floor-strip (`?floor=<key>`, or `?view=<key>` for People/clients).
 *      Historically each app page owned a local `floors` literal; those are
 *      LIFTED here so both the page's floor strip AND the desktop
 *      `AppSidebar` import the same list.
 *
 * Consumers:
 *   - `AppSidebar.vue` — renders apps as collapsible groups, floors as
 *     sub-links deep-linking to `<app.to>?<param>=<key>`.
 *   - `app/pages/apps/<app>/index.vue` — imports its floors via
 *     `appFloors('<id>')` instead of a local literal (behaviour-preserving;
 *     pages still apply any local visibility filtering, e.g. Marketing hides
 *     Accounts when social publishing is off).
 *
 * Apps with no floors (Dashboard, Channels, Director, Account) render as a
 * single app link with nothing to expand.
 */
import {
	APP_ORDER,
	APP_FOOTER_ORDER,
	APP_ACCENTS,
	appIdForPath,
	type AppId,
} from '~/composables/useAppAccent';

export interface AppFloor {
	/** URL key — deep-links to `<app.to>?<floorParam>=<key>`. */
	key: string;
	label: string;
	/** Icon name for `<Icon :name>` (lucide:* or a local collection id). */
	icon: string;
}

export interface AppNavItem {
	id: AppId;
	name: string;
	shortName?: string;
	icon: string;
	to: string;
	/**
	 * Query param this app's floor strip binds to. Everything uses `floor`
	 * except People (`/apps/clients`), whose segmented control persists via
	 * `view`. The sidebar reads this to build the correct deep-link + to
	 * resolve the active floor from the URL.
	 */
	floorParam: 'floor' | 'view';
	floors: AppFloor[];
}

/**
 * Per-app floor lists — the canonical copy. Each app page consumes its own
 * list via `appFloors(id)`; the sidebar walks all of them. Keep labels/icons
 * in sync with the app page's floor-strip expectations (they render the same
 * `AppFloorStrip` items).
 *
 * NOTE: Marketing's full list includes `accounts`; the Marketing page hides
 * it when social publishing is off (page-local `computed`). The sidebar shows
 * the full set — clicking Accounts while it's off lands on Studio via the
 * page's own `?floor=accounts` redirect, so nothing breaks.
 */
const FLOORS: Partial<Record<AppId, AppFloor[]>> = {
	clients: [
		{ key: 'clients', label: 'Clients', icon: 'lucide:building-2' },
		{ key: 'contacts', label: 'Contacts', icon: 'lucide:users' },
		{ key: 'leads', label: 'Leads', icon: 'lucide:trending-up' },
		{ key: 'carddesk', label: 'Card Desk', icon: 'lucide:contact' },
		{ key: 'intelligence', label: 'Intelligence', icon: 'earnest' },
	],
	work: [
		{ key: 'projects', label: 'Projects', icon: 'lucide:folder-kanban' },
		{ key: 'tasks', label: 'Tasks', icon: 'lucide:check-square' },
		{ key: 'tickets', label: 'Tickets', icon: 'lucide:ticket' },
		{ key: 'calendar', label: 'Calendar', icon: 'lucide:calendar' },
		{ key: 'time', label: 'Time', icon: 'lucide:clock' },
		{ key: 'insights', label: 'Insights', icon: 'lucide:bar-chart-3' },
	],
	money: [
		{ key: 'cashflow', label: 'Cash flow', icon: 'lucide:trending-up' },
		{ key: 'documents', label: 'Documents', icon: 'lucide:files' },
		{ key: 'invoices', label: 'Invoices', icon: 'lucide:file-text' },
		{ key: 'payments', label: 'Payments', icon: 'lucide:credit-card' },
		{ key: 'deposits', label: 'Deposits', icon: 'lucide:banknote' },
		{ key: 'expenses', label: 'Expenses', icon: 'lucide:receipt' },
		{ key: 'insights', label: 'Insights', icon: 'lucide:bar-chart-3' },
	],
	marketing: [
		{ key: 'pulse', label: 'Pulse', icon: 'lucide:activity' },
		{ key: 'campaigns', label: 'Campaigns', icon: 'lucide:rocket' },
		{ key: 'email', label: 'Email', icon: 'lucide:mail' },
		{ key: 'accounts', label: 'Accounts', icon: 'lucide:share-2' },
		{ key: 'studio', label: 'Studio', icon: 'lucide:palette' },
		{ key: 'audience', label: 'Audience', icon: 'lucide:users' },
	],
	organization: [
		{ key: 'overview', label: 'Overview', icon: 'lucide:home' },
		{ key: 'members', label: 'Members', icon: 'lucide:users' },
		{ key: 'teams', label: 'Teams', icon: 'lucide:users-round' },
		{ key: 'billing', label: 'Billing', icon: 'lucide:credit-card' },
		{ key: 'ai', label: 'AI & Tokens', icon: 'lucide:sparkles' },
		{ key: 'communications', label: 'Email', icon: 'lucide:mail' },
		{ key: 'integrations', label: 'Integrations', icon: 'lucide:plug' },
		{ key: 'settings', label: 'Settings', icon: 'lucide:settings' },
	],
};

/** Apps whose floor strip persists on a non-default query param. */
const FLOOR_PARAM: Partial<Record<AppId, AppNavItem['floorParam']>> = {
	clients: 'view',
};

/** Footer nav order — Director's Office, then the org/account footer apps. */
export const APP_NAV_FOOTER_ORDER: AppId[] = ['director', ...APP_FOOTER_ORDER];

/** The floor param an app binds to (`floor` unless overridden). */
export function floorParamFor(id: AppId): AppNavItem['floorParam'] {
	return FLOOR_PARAM[id] ?? 'floor';
}

/**
 * Canonical floor list for an app — pages import this instead of holding a
 * local literal, so the floor strip and the sidebar never diverge.
 */
export function appFloors(id: AppId): AppFloor[] {
	return FLOORS[id] ?? [];
}

function navItem(id: AppId): AppNavItem {
	const meta = APP_ACCENTS[id];
	return {
		id,
		name: meta.name,
		shortName: meta.shortName,
		icon: meta.icon,
		to: meta.to,
		floorParam: floorParamFor(id),
		floors: appFloors(id),
	};
}

/**
 * Reactive nav model for the sidebar. `apps` = main rail apps, `footer` =
 * Director + org/account. `activeAppId` / `activeFloorKey` track the current
 * route so the sidebar can auto-expand + highlight.
 */
export function useAppNav() {
	const route = useRoute();

	const apps = computed<AppNavItem[]>(() => APP_ORDER.map(navItem));
	const footer = computed<AppNavItem[]>(() => APP_NAV_FOOTER_ORDER.map(navItem));

	const activeAppId = computed<AppId | null>(() => appIdForPath(route.path));

	const activeFloorKey = computed<string | null>(() => {
		const id = activeAppId.value;
		if (!id) return null;
		const floors = appFloors(id);
		if (!floors.length) return null;
		const raw = route.query[floorParamFor(id)];
		if (typeof raw === 'string' && floors.some((f) => f.key === raw)) return raw;
		// No (or unknown) param → the app's default floor is the first one.
		return floors[0]?.key ?? null;
	});

	return { apps, footer, activeAppId, activeFloorKey };
}
