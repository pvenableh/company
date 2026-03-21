/**
 * Timeline Icon Theme System
 *
 * Lets users swap the default Heroicon icons on timeline cards
 * for themed emoji packs (fluent-emoji-flat) or alternative icon sets.
 *
 * Persists to localStorage; integrates with the existing appearance settings.
 */

export interface TimelineThemeDefinition {
	id: string;
	name: string;
	description: string;
	/** Preview icon shown in the picker */
	preview: string;
	/** Icon map: collection key → icon name */
	collectionIcons: Record<string, string>;
	/** Action icon map: create/update/delete → icon name */
	actionIcons: Record<string, string>;
}

const STORAGE_KEY = 'earnest-timeline-theme';

// ── Default Heroicons (matches current Timeline.vue) ──

const heroiconsCollection: Record<string, string> = {
	projects: 'i-heroicons-folder',
	tickets: 'i-heroicons-square-3-stack-3d',
	invoices: 'i-heroicons-document-currency-dollar',
	project_tasks: 'i-heroicons-check-circle',
	emails: 'i-heroicons-envelope',
	cd_contacts: 'i-heroicons-identification',
	cd_activities: 'i-heroicons-phone-arrow-up-right',
	contacts: 'i-heroicons-user-plus',
	clients: 'i-heroicons-building-office',
	tasks: 'i-heroicons-clipboard-document-check',
};

const heroiconsActions: Record<string, string> = {
	create: 'i-heroicons-plus-circle',
	update: 'i-heroicons-pencil-square',
	delete: 'i-heroicons-trash',
};

// ── Emoji Theme Packs ──

const themes: TimelineThemeDefinition[] = [
	{
		id: 'default',
		name: 'Classic',
		description: 'Clean Heroicons',
		preview: 'i-heroicons-square-3-stack-3d',
		collectionIcons: heroiconsCollection,
		actionIcons: heroiconsActions,
	},
	{
		id: 'animals',
		name: 'Animals',
		description: 'Cute critters for every collection',
		preview: 'i-fluent-emoji-flat-fox',
		collectionIcons: {
			projects: 'i-fluent-emoji-flat-fox',
			tickets: 'i-fluent-emoji-flat-honeybee',
			invoices: 'i-fluent-emoji-flat-owl',
			project_tasks: 'i-fluent-emoji-flat-rabbit',
			emails: 'i-fluent-emoji-flat-dove',
			cd_contacts: 'i-fluent-emoji-flat-dolphin',
			cd_activities: 'i-fluent-emoji-flat-parrot',
			contacts: 'i-fluent-emoji-flat-butterfly',
			clients: 'i-fluent-emoji-flat-lion',
			tasks: 'i-fluent-emoji-flat-hatching-chick',
		},
		actionIcons: {
			create: 'i-fluent-emoji-flat-paw-prints',
			update: 'i-fluent-emoji-flat-snail',
			delete: 'i-fluent-emoji-flat-skull',
		},
	},
	{
		id: 'food',
		name: 'Food',
		description: 'Tasty icons for every update',
		preview: 'i-fluent-emoji-flat-pizza',
		collectionIcons: {
			projects: 'i-fluent-emoji-flat-pizza',
			tickets: 'i-fluent-emoji-flat-taco',
			invoices: 'i-fluent-emoji-flat-pie',
			project_tasks: 'i-fluent-emoji-flat-cookie',
			emails: 'i-fluent-emoji-flat-love-letter',
			cd_contacts: 'i-fluent-emoji-flat-cupcake',
			cd_activities: 'i-fluent-emoji-flat-hot-beverage',
			contacts: 'i-fluent-emoji-flat-bento-box',
			clients: 'i-fluent-emoji-flat-birthday-cake',
			tasks: 'i-fluent-emoji-flat-doughnut',
		},
		actionIcons: {
			create: 'i-fluent-emoji-flat-seedling',
			update: 'i-fluent-emoji-flat-cooking',
			delete: 'i-fluent-emoji-flat-fire',
		},
	},
	{
		id: 'travel',
		name: 'Travel',
		description: 'Adventure awaits in your timeline',
		preview: 'i-fluent-emoji-flat-compass',
		collectionIcons: {
			projects: 'i-fluent-emoji-flat-compass',
			tickets: 'i-fluent-emoji-flat-ticket',
			invoices: 'i-fluent-emoji-flat-money-bag',
			project_tasks: 'i-fluent-emoji-flat-round-pushpin',
			emails: 'i-fluent-emoji-flat-love-letter',
			cd_contacts: 'i-fluent-emoji-flat-globe-showing-americas',
			cd_activities: 'i-fluent-emoji-flat-airplane',
			contacts: 'i-fluent-emoji-flat-luggage',
			clients: 'i-fluent-emoji-flat-classical-building',
			tasks: 'i-fluent-emoji-flat-camping',
		},
		actionIcons: {
			create: 'i-fluent-emoji-flat-rocket',
			update: 'i-fluent-emoji-flat-motor-boat',
			delete: 'i-fluent-emoji-flat-volcano',
		},
	},
	{
		id: 'objects',
		name: 'Objects',
		description: 'Everyday things, charming icons',
		preview: 'i-fluent-emoji-flat-light-bulb',
		collectionIcons: {
			projects: 'i-fluent-emoji-flat-toolbox',
			tickets: 'i-fluent-emoji-flat-pushpin',
			invoices: 'i-fluent-emoji-flat-gem-stone',
			project_tasks: 'i-fluent-emoji-flat-light-bulb',
			emails: 'i-fluent-emoji-flat-incoming-envelope',
			cd_contacts: 'i-fluent-emoji-flat-card-index',
			cd_activities: 'i-fluent-emoji-flat-telephone-receiver',
			contacts: 'i-fluent-emoji-flat-notebook',
			clients: 'i-fluent-emoji-flat-briefcase',
			tasks: 'i-fluent-emoji-flat-clipboard',
		},
		actionIcons: {
			create: 'i-fluent-emoji-flat-sparkles',
			update: 'i-fluent-emoji-flat-wrench',
			delete: 'i-fluent-emoji-flat-wastebasket',
		},
	},
	{
		id: 'nature',
		name: 'Nature',
		description: 'Flowers, plants & cosmic vibes',
		preview: 'i-fluent-emoji-flat-sunflower',
		collectionIcons: {
			projects: 'i-fluent-emoji-flat-deciduous-tree',
			tickets: 'i-fluent-emoji-flat-sunflower',
			invoices: 'i-fluent-emoji-flat-four-leaf-clover',
			project_tasks: 'i-fluent-emoji-flat-cherry-blossom',
			emails: 'i-fluent-emoji-flat-hibiscus',
			cd_contacts: 'i-fluent-emoji-flat-cactus',
			cd_activities: 'i-fluent-emoji-flat-rainbow',
			contacts: 'i-fluent-emoji-flat-tulip',
			clients: 'i-fluent-emoji-flat-sun',
			tasks: 'i-fluent-emoji-flat-herb',
		},
		actionIcons: {
			create: 'i-fluent-emoji-flat-seedling',
			update: 'i-fluent-emoji-flat-fallen-leaf',
			delete: 'i-fluent-emoji-flat-wilted-flower',
		},
	},
];

// Shared singleton state
const currentThemeId = ref<string>('default');

export function useTimelineTheme() {
	const currentTheme = computed(() =>
		themes.find((t) => t.id === currentThemeId.value) || themes[0]
	);

	const collectionIcons = computed(() => currentTheme.value.collectionIcons);
	const actionIcons = computed(() => currentTheme.value.actionIcons);

	const setTheme = (themeId: string) => {
		const exists = themes.find((t) => t.id === themeId);
		if (!exists) return;
		currentThemeId.value = themeId;
		if (import.meta.client) {
			localStorage.setItem(STORAGE_KEY, themeId);
		}
	};

	const initTheme = () => {
		if (!import.meta.client) return;
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved && themes.find((t) => t.id === saved)) {
			currentThemeId.value = saved;
		}
	};

	// Auto-init on first use
	if (!import.meta.server) {
		initTheme();
	}

	return {
		themes,
		currentThemeId: readonly(currentThemeId),
		currentTheme,
		collectionIcons,
		actionIcons,
		setTheme,
		initTheme,
	};
}
