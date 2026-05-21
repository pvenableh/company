/**
 * Panel registry — type → async component map for `<AppSlideOverStack>`.
 *
 * Each panel is a single-file Vue component under this directory that
 * takes `{ id: string }` as its prop and fetches its own data. Panels
 * are dynamically imported so unused ones stay out of the bundle.
 *
 * Adding a new panel:
 *   1. Create `panels/<Entity>Panel.vue` with `defineProps<{ id: string }>()`.
 *   2. Wrap its content in `<AppSlideOverShell :title="…">`.
 *   3. Add an entry below mapping a stack-type string → loader.
 *   4. From the page that triggers it:
 *        const slide = useAppSlideOver('<type>')
 *        slide.open(entityId)
 *      (or `useAppSlideOverStack().push('<type>', entityId)` from inside
 *      another panel for cross-panel pushes.)
 */
import type { Component } from 'vue';
import { defineAsyncComponent } from 'vue';

type PanelLoader = () => Promise<{ default: Component }>;

const REGISTRY: Record<string, PanelLoader> = {
	contact: () => import('./ContactPanel.vue'),
	'work-project': () => import('./ProjectDetailPanel.vue'),
	'work-meeting': () => import('./MeetingPanel.vue'),
	ticket: () => import('./TicketDetailPanel.vue'),
	'marketing-campaign': () => import('./CampaignPanel.vue'),
	'social-post': () => import('./SocialPostPanel.vue'),
	'social-compose': () => import('./SocialComposePanel.vue'),
	'social-plan': () => import('./PlanDetailPanel.vue'),
	client: () => import('./ClientDetailPanel.vue'),
	'carddesk-source': () => import('./CardDeskSourcePanel.vue'),
	proposal: () => import('./ProposalPanel.vue'),
	contract: () => import('./ContractPanel.vue'),
	documents_library: () => import('./DocumentsLibraryPanel.vue'),
	teams: () => import('./TeamsPanel.vue'),
	roles: () => import('./RolesPanel.vue'),
	'mailing-list': () => import('./MailingListPanel.vue'),
	invoice: () => import('./InvoicePanel.vue'),
	task: () => import('./TaskPanel.vue'),
	'project-event': () => import('./EventPanel.vue'),
	'social-accounts': () => import('./SocialAccountsPanel.vue'),
};

const componentCache = new Map<string, Component>();

export function getPanelComponent(type: string): Component | null {
	const loader = REGISTRY[type];
	if (!loader) return null;
	let comp = componentCache.get(type);
	if (!comp) {
		comp = defineAsyncComponent({
			loader,
			loadingComponent: undefined,
			delay: 60,
		});
		componentCache.set(type, comp);
	}
	return comp;
}

export function hasPanel(type: string): boolean {
	return type in REGISTRY;
}
