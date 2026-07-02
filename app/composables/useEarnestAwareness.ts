/**
 * useEarnestAwareness — route + user + org + entity awareness for the unified
 * Earnest panel. Earnest's analog of CardDesk's `useAskEarnest`: it turns the
 * current page (and any focused entity) into
 *
 *   - `scope`   — coarse bucket used for prompt tone + session keying
 *   - `focus`   — a human "right now you're looking at …" sentence injected
 *                 into the system prompt
 *   - `knowledge` — the deselectable list shown in the "What Earnest can see"
 *                 chip. Each item carries an `included` flag; the panel binds a
 *                 toggle to it, and only included keys are sent to the server.
 *
 * Route → scope/focus reuses `appIdForPath()` (the same mapping the AppRail
 * uses to light its active chip) so the panel's sense of "where am I" never
 * drifts from the rail. Entity context is read from the shared
 * `useEntityPageContext` that detail pages already populate via `setEntity()`.
 *
 * Knowledge keys are intentionally coarse (`user` / `organization` / `entity`)
 * so the server can gate whole context blocks on them — see
 * server/api/ai/chat.post.ts. Deselections reset whenever the context key
 * changes, so each new page/entity starts with everything Earnest can see.
 */
import { appIdForPath } from '~/composables/useAppAccent';

export interface AwareItem {
	/** Coarse gating key the server understands: 'user' | 'organization' | 'entity'. */
	key: 'user' | 'organization' | 'entity';
	icon: string;
	label: string;
	/** Whether this knowledge is currently included in the prompt. */
	included: boolean;
}

interface RouteContext {
	scope: string;
	focus: string;
}

const ENTITY_READABLE: Record<string, string> = {
	project_event: 'event',
	social_post: 'post',
	financials: 'dashboard',
	marketing: 'dashboard',
	video_meeting: 'meeting',
	cd_contact: 'networking contact',
};

const ENTITY_ICON: Record<string, string> = {
	client: 'lucide:building-2',
	contact: 'lucide:user-round',
	project: 'lucide:folder-kanban',
	invoice: 'lucide:file-text',
	proposal: 'lucide:file-signature',
	ticket: 'lucide:ticket',
	lead: 'lucide:trending-up',
	team: 'lucide:users',
	video_meeting: 'lucide:video',
	channel: 'lucide:hash',
	social_post: 'lucide:megaphone',
	list: 'lucide:list',
	email: 'lucide:mail',
	project_event: 'lucide:calendar',
	financials: 'lucide:bar-chart-3',
	marketing: 'lucide:bar-chart-3',
	cd_contact: 'lucide:contact-round',
};

/** What the entity item says Earnest can see, per entity type. */
const ENTITY_KNOWLEDGE: Record<string, string> = {
	client: 'This client — activity, invoices, contacts & brand',
	contact: 'This contact — engagement, lists & linked leads',
	project: 'This project — tasks, timeline & team',
	invoice: 'This invoice — line items, payments & client',
	proposal: 'This proposal — content, status & recipient',
	ticket: 'This ticket — status, priority & comments',
	lead: 'This lead — stage, score & activity',
	team: 'This team — members, goals & workload',
	video_meeting: 'This meeting — transcript, decisions & action items',
	channel: 'This channel — recent messages & threads',
	social_post: 'This post — caption, schedule & platform',
	list: 'This list — audience & engagement',
	email: 'This email — copy, blocks & audience',
	project_event: 'This event — status & remaining work',
	financials: 'Your financials — cashflow, invoices & revenue',
	marketing: 'Your marketing — campaigns & engagement',
	cd_contact: 'This networking contact — activity, plans & follow-up tasks',
};

/** Route-aware prompt suggestions for general (non-entity) scopes. */
const SCOPE_PROMPTS: Record<string, string[]> = {
	dashboard: [
		'What needs my attention today?',
		'Summarize where things stand across the business',
		'What\'s overdue or at risk right now?',
	],
	people: [
		'Which clients haven\'t I followed up with?',
		'Summarize my pipeline and hottest leads',
		'Who should I reconnect with this week?',
	],
	work: [
		'What\'s blocking progress across my projects?',
		'Summarize my open tasks and tickets',
		'What\'s due this week?',
	],
	money: [
		'Which invoices are overdue or at risk?',
		'How is cashflow this month?',
		'Summarize outstanding proposals and contracts',
	],
	marketing: [
		'What campaigns should I run this month?',
		'Analyze my recent engagement trends',
		'Draft a content idea for next week',
	],
	organization: [
		'How is my team\'s workload distributed?',
		'Summarize open goals and progress',
		'What should leadership focus on this quarter?',
	],
	goals: [
		'How am I tracking against my goals?',
		'Which goals need attention?',
		'Suggest a focus for this quarter',
	],
	account: [
		'How am I tracking against my goals?',
		'What should I prioritize this week?',
	],
	general: [
		'What needs my attention today?',
		'Summarize where things stand',
	],
};

/** Live meeting prompts — different goal than recap (help *during* the call). */
const LIVE_MEETING_PROMPTS = [
	'What have we discussed so far?',
	'Capture the latest decision as a note',
	'Draft a follow-up for the client',
	'What should I cover before we wrap?',
];

const ENTITY_PROMPTS: Record<string, string[]> = {
	client: ['Summarize recent activity for this client', 'Draft a follow-up email', 'What\'s outstanding for this client?'],
	project: ['What\'s blocking progress on this project?', 'Summarize the task status', 'Push the start date back 2 weeks'],
	invoice: ['Why is this invoice overdue?', 'Draft a payment reminder email', 'Summarize payment history'],
	contact: ['Summarize this contact\'s recent engagement', 'Draft a personalized outreach email', 'What lists and leads are linked here?'],
	cd_contact: ['Summarize where things stand with this contact', 'Draft a follow-up message to reconnect', 'What\'s the next best action here?'],
	proposal: ['Summarize this proposal and its status', 'Draft a follow-up to the recipient', 'What should I revise before sending?'],
	ticket: ['Summarize what this ticket is about', 'What\'s blocking progress here?', 'Change priority to urgent'],
	lead: ['Summarize this lead and where it stands', 'Draft a follow-up message', 'What\'s the next best action?'],
	team: ['What is this team working on right now?', 'Summarize open goals and progress', 'Draft a standup-style status update'],
	video_meeting: ['Summarize the conversation', 'Pull out action items I haven\'t promoted yet', 'Draft a follow-up email to attendees'],
	channel: ['Summarize what\'s been discussed lately', 'Who\'s active and what are the open threads?', 'Suggest what I should follow up on'],
	social_post: ['Tighten the caption copy', 'Suggest hashtags for this post', 'Recommend the best posting time'],
	list: ['Who\'s on this list and how is engagement?', 'Suggest segments to peel off', 'Draft an email to this audience'],
	email: ['Suggest a subject line', 'Improve the copy in this template', 'What content blocks would work here?'],
	financials: ['How is cashflow this month?', 'Which invoices are overdue or at risk?', 'Summarize revenue trends'],
	marketing: ['What campaigns should I run this month?', 'Analyze my email engagement trends', 'Draft a content calendar'],
};

/** Map the owning app (from appIdForPath) → scope + focus sentence. */
function routeContextFor(path: string): RouteContext {
	const appId = appIdForPath(path);
	const isGoals = path.startsWith('/account') && /(?:^|[?&])section=goals/.test(path);

	if (isGoals) {
		return { scope: 'goals', focus: 'your Goals — objectives across yourself, your team, clients and the organization' };
	}
	switch (appId) {
		case 'dashboard':
			return { scope: 'dashboard', focus: 'your Dashboard — a cross-business overview of what needs attention' };
		case 'clients':
			return { scope: 'people', focus: 'the People app — your clients, contacts and leads' };
		case 'work':
			return { scope: 'work', focus: 'the Work app — your projects, tasks, tickets and meetings' };
		case 'money':
			return { scope: 'money', focus: 'the Money app — invoices, contracts, proposals and revenue' };
		case 'marketing':
			return { scope: 'marketing', focus: 'the Marketing app — campaigns, audiences and content' };
		case 'organization':
			return { scope: 'organization', focus: 'the Organization app — members, teams, billing and goals' };
		case 'account':
			return { scope: 'account', focus: 'your Account — profile, goals and preferences' };
		default:
			return { scope: 'general', focus: 'your Earnest workspace' };
	}
}

export function useEarnestAwareness() {
	const route = useRoute();
	const { currentOrg, selectedOrg } = useOrganization();
	const {
		entityType,
		entityId,
		entityLabel,
		entityPrompts,
		entitySurface,
	} = useEntityPageContext();

	const hasEntity = computed(() => !!entityType.value && !!entityId.value);

	// Build a path string that includes the query so the goals section is
	// detectable (appIdForPath only sees the pathname).
	const fullPath = computed(() => route.fullPath);

	const routeCtx = computed<RouteContext>(() => routeContextFor(fullPath.value));

	const scope = computed(() => (hasEntity.value ? (entityType.value as string) : routeCtx.value.scope));

	const entityReadable = computed(() => {
		const t = entityType.value as string;
		return (t && ENTITY_READABLE[t]) || t || '';
	});

	const focus = computed(() => {
		if (hasEntity.value) {
			const label = entityLabel.value ? ` "${entityLabel.value}"` : '';
			return `the ${entityReadable.value}${label}`;
		}
		return routeCtx.value.focus;
	});

	/** Stable key for session persistence + deselection reset. */
	const contextKey = computed(() =>
		hasEntity.value ? `entity:${entityType.value}:${entityId.value}` : `route:${routeCtx.value.scope}`,
	);

	// Deselected knowledge keys — reset whenever the context changes so each
	// page/entity starts with everything Earnest can see toggled on.
	const excluded = ref<Set<string>>(new Set());
	watch(contextKey, () => { excluded.value = new Set(); });

	const knowledge = computed<AwareItem[]>(() => {
		const items: Array<Omit<AwareItem, 'included'>> = [];

		// Always: the user.
		items.push({
			key: 'user',
			icon: 'lucide:user-round',
			label: 'Your profile, role & current tasks',
		});

		// Organization (when one is selected).
		if (selectedOrg.value) {
			const name = (currentOrg.value as any)?.name;
			items.push({
				key: 'organization',
				icon: 'lucide:building-2',
				label: name
					? `${name} — clients, projects, invoices & deals`
					: 'Your organization — clients, projects, invoices & deals',
			});
		}

		// The focused entity (detail pages).
		if (hasEntity.value) {
			const t = entityType.value as string;
			items.push({
				key: 'entity',
				icon: ENTITY_ICON[t] || 'lucide:file',
				label: ENTITY_KNOWLEDGE[t] || `This ${entityReadable.value}`,
			});
		}

		return items.map((i) => ({ ...i, included: !excluded.value.has(i.key) }));
	});

	const includedKeys = computed(() => knowledge.value.filter((i) => i.included).map((i) => i.key));

	function toggle(key: string) {
		const next = new Set(excluded.value);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		excluded.value = next;
	}

	/** Prompt suggestions — page-supplied (adaptive) first, then entity/scope defaults. */
	const suggestedPrompts = computed<string[]>(() => {
		const supplied = entityPrompts.value?.filter(Boolean) ?? [];
		if (supplied.length) return supplied;
		if (hasEntity.value) {
			const t = entityType.value as string;
			if (t === 'video_meeting' && entitySurface.value === 'live') return LIVE_MEETING_PROMPTS;
			return ENTITY_PROMPTS[t] || ENTITY_PROMPTS.client;
		}
		return SCOPE_PROMPTS[routeCtx.value.scope] || SCOPE_PROMPTS.general;
	});

	return {
		// context
		scope,
		focus,
		contextKey,
		hasEntity,
		entityType,
		entityId,
		entityLabel,
		entityReadable,
		entitySurface,
		// knowledge
		knowledge,
		includedKeys,
		toggle,
		// prompts
		suggestedPrompts,
	};
}
