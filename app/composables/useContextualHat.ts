/**
 * Contextual Hat — Auto-Detected Workspace Context
 *
 * Replaces manual HatPicker by inferring the user's current context
 * from the active route. Used by all layout modes to highlight
 * the active navigation section.
 *
 * Contexts: work, people, money, engage, ai
 */

export type WorkspaceContext = 'work' | 'people' | 'money' | 'engage' | 'ai' | 'settings';

interface ContextMapping {
	context: WorkspaceContext;
	/** Route prefixes that belong to this context */
	routes: string[];
}

const CONTEXT_MAP: ContextMapping[] = [
	{
		context: 'work',
		routes: ['/projects', '/tickets', '/tasks', '/scheduler', '/files', '/goals', '/time-tracker'],
	},
	{
		context: 'people',
		routes: ['/people', '/contacts', '/clients', '/leads', '/channels', '/organization/teams'],
	},
	{
		context: 'money',
		routes: ['/invoices', '/proposals', '/expenses', '/financials', '/payouts'],
	},
	{
		context: 'engage',
		routes: ['/email', '/social', '/marketing'],
	},
	{
		context: 'ai',
		routes: ['/command-center', '/dashboard'],
	},
	{
		context: 'settings',
		routes: ['/account', '/organization'],
	},
];

export function useContextualHat() {
	const route = useRoute();

	const currentContext = computed<WorkspaceContext>(() => {
		const path = route.path;

		// Home page maps to AI/Command Center
		if (path === '/') return 'ai';

		for (const mapping of CONTEXT_MAP) {
			if (mapping.routes.some((prefix) => path.startsWith(prefix))) {
				return mapping.context;
			}
		}

		// Default to work for unknown routes
		return 'work';
	});

	const isContext = (context: WorkspaceContext) => currentContext.value === context;

	return {
		currentContext,
		isContext,
		contextMap: CONTEXT_MAP,
	};
}
