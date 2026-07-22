import { useDirectusItems } from './useDirectusItems';

/**
 * useOnboardingProgress — drives the dashboard "Get set up" checklist.
 *
 * A new org admin lands on an empty org. The org-creation wizard
 * (`/organization/new`) already handles naming + plan + payment + first
 * invites, but nothing bridges the gap from "org exists" to "first real
 * work." This composable measures that gap from live data and exposes a
 * small, role-adaptive step list the checklist card renders.
 *
 * Completion is derived from actual record counts (org-scoped), NOT a stored
 * "I clicked the button" flag — so it's correct across refreshes, devices,
 * and for invited admins who join an already-populated org (their steps read
 * as already-done). The only persisted bit is a per-user+org DISMISSAL, so a
 * finished/uninterested admin can make the card go away for good.
 *
 * Org-scoping mirrors the rest of the app: clients/projects scope on
 * `organization`; invoices scope on `bill_to` (see useInvoices). Membership
 * count includes the owner themselves, so ">1" means someone was invited.
 */

export type OnboardingStepId = 'invite' | 'client' | 'project' | 'invoice';

export interface OnboardingStep {
	id: OnboardingStepId;
	title: string;
	description: string;
	/** Lucide icon name (see AppHeader / checklist for rendering). */
	icon: string;
	/** Where the primary CTA sends the user. Deep-links auto-open the create modal. */
	to: string;
	/** CTA label when the step is not yet done. */
	cta: string;
	done: boolean;
}

export function useOnboardingProgress() {
	const { selectedOrg, currentOrg } = useOrganization();
	const { user } = useDirectusAuth();
	const { isOrgManagerOrAbove, isOrgAdminOrAbove, canCreate } = useOrgRole();

	const clientsItems = useDirectusItems('clients');
	const projectsItems = useDirectusItems('projects');
	const invoicesItems = useDirectusItems('invoices');
	const membershipItems = useDirectusItems('org_memberships');

	// ── Raw counts (org-scoped) ───────────────────────────────────────────────
	const clientCount = useState<number>('onboardingClientCount', () => 0);
	const projectCount = useState<number>('onboardingProjectCount', () => 0);
	const invoiceCount = useState<number>('onboardingInvoiceCount', () => 0);
	const memberCount = useState<number>('onboardingMemberCount', () => 0);
	const loading = useState<boolean>('onboardingLoading', () => false);
	const loaded = useState<boolean>('onboardingLoaded', () => false);

	// Session-only memory that the user has actively worked an incomplete
	// checklist this session. Lets us show the celebratory "all set" state to a
	// founder who just finished, without nagging an established org's admin who
	// walked in to a fully-populated workspace (allComplete on first sight).
	const wasIncompleteThisSession = useState<boolean>('onboardingWasIncomplete', () => false);

	async function refresh(): Promise<void> {
		const orgId = selectedOrg.value;
		if (!user.value?.id || !orgId) {
			loaded.value = false;
			return;
		}
		loading.value = true;
		try {
			const orgFilter = { organization: { _eq: orgId } };
			const [clients, projects, invoices, members] = await Promise.all([
				clientsItems.count(orgFilter),
				projectsItems.count(orgFilter),
				// Invoices scope on bill_to, not organization.
				invoicesItems.count({ bill_to: { _eq: orgId } }),
				membershipItems.count({ organization: { _eq: orgId }, status: { _neq: 'suspended' } }),
			]);
			clientCount.value = clients;
			projectCount.value = projects;
			invoiceCount.value = invoices;
			memberCount.value = members;
			loaded.value = true;
			if (!allComplete.value) wasIncompleteThisSession.value = true;
		} catch (err) {
			// Non-fatal: a failed count just leaves the card hidden rather than
			// showing a wrong "you haven't done X" nudge.
			console.error('useOnboardingProgress: count failed', err);
			loaded.value = false;
		} finally {
			loading.value = false;
		}
	}

	// ── Steps ─────────────────────────────────────────────────────────────────
	// Ordered by the data dependency chain: a client anchors everything, an
	// invoice requires a client, a project sits naturally in between. Invite is
	// first because it's the one thing only an owner/admin does.
	const steps = computed<OnboardingStep[]>(() => {
		const all: (OnboardingStep & { show: boolean })[] = [
			{
				id: 'invite',
				title: 'Invite a teammate',
				description: 'Bring the people you work with into the workspace.',
				icon: 'lucide:user-plus',
				to: '/apps/organization?floor=members&invite=1',
				cta: 'Invite',
				done: memberCount.value > 1,
				// Only owner/admin can invite members (server enforces this).
				show: isOrgAdminOrAbove.value && canCreate('member_management'),
			},
			{
				id: 'client',
				title: 'Add your first client',
				description: 'Clients anchor every project and invoice you’ll create.',
				icon: 'lucide:users',
				to: '/clients?new=1',
				cta: 'Add client',
				done: clientCount.value > 0,
				show: canCreate('clients'),
			},
			{
				id: 'project',
				title: 'Start your first project',
				description: 'Track the work you’re doing — link it to a client.',
				icon: 'lucide:folder-kanban',
				to: '/projects?new=1',
				cta: 'New project',
				done: projectCount.value > 0,
				show: canCreate('projects'),
			},
			{
				id: 'invoice',
				title: 'Send your first invoice',
				description: 'Bill a client and get paid — Stripe is already wired up.',
				icon: 'lucide:receipt',
				to: '/invoices?new=1',
				cta: 'Create invoice',
				done: invoiceCount.value > 0,
				show: canCreate('invoices'),
			},
		];
		// The extra `show` flag is harmless at runtime; the template never reads it.
		return all.filter((s) => s.show);
	});

	const completedCount = computed(() => steps.value.filter((s) => s.done).length);
	const totalCount = computed(() => steps.value.length);
	const allComplete = computed(() => totalCount.value > 0 && completedCount.value === totalCount.value);
	const nextStep = computed<OnboardingStep | null>(() => steps.value.find((s) => !s.done) ?? null);

	// ── Dismissal (per user + org) ────────────────────────────────────────────
	function dismissKey(): string | null {
		const uid = user.value?.id;
		const oid = selectedOrg.value;
		if (!uid || !oid) return null;
		return `earnest:onboarding-dismissed:${uid}:${oid}`;
	}

	const dismissedTick = useState<number>('onboardingDismissTick', () => 0);
	const isDismissed = computed(() => {
		// dismissedTick is a reactivity nudge — reading it re-evaluates after dismiss().
		void dismissedTick.value;
		if (!import.meta.client) return false;
		const key = dismissKey();
		if (!key) return false;
		try {
			return localStorage.getItem(key) === '1';
		} catch {
			return false;
		}
	});

	function dismiss(): void {
		if (!import.meta.client) return;
		const key = dismissKey();
		if (!key) return;
		try {
			localStorage.setItem(key, '1');
		} catch {
			// ignore — worst case the card reappears next load
		}
		dismissedTick.value += 1;
	}

	// ── Visibility ────────────────────────────────────────────────────────────
	// Show only to people who actually onboard an org (manager and up), never to
	// plain members. Hidden once dismissed. When everything's already complete we
	// only surface the celebratory state if the user worked toward it this
	// session — an established admin walking into a full org sees nothing.
	const shouldShow = computed(() => {
		if (!loaded.value) return false;
		if (!isOrgManagerOrAbove.value) return false;
		if (isDismissed.value) return false;
		if (totalCount.value === 0) return false;
		if (allComplete.value && !wasIncompleteThisSession.value) return false;
		return true;
	});

	// Org / user context name for the header copy.
	const orgName = computed(() => (currentOrg.value as any)?.name ?? 'your workspace');
	const firstName = computed(() => (user.value as any)?.first_name ?? '');

	// Auto-refresh when the org (or user) changes.
	if (import.meta.client) {
		watch(
			[() => selectedOrg.value, () => user.value?.id],
			([orgId, uid]) => {
				if (orgId && uid) refresh();
				else loaded.value = false;
			},
			{ immediate: true },
		);
	}

	return {
		// data
		steps,
		clientCount,
		projectCount,
		invoiceCount,
		memberCount,
		completedCount,
		totalCount,
		allComplete,
		nextStep,
		orgName,
		firstName,
		// state
		loading,
		loaded,
		shouldShow,
		isDismissed,
		// actions
		refresh,
		dismiss,
	};
}
