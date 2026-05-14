/**
 * useAppIntros — per-user dismissible intro cards on every /apps/* landing.
 *
 * Stage 3 of the "Me" lens initiative. Each top-level app gets a short
 * "what is this app for" card on its index page. The user can dismiss it;
 * dismissal is persisted on `directus_users.dismissed_app_intros` (a json
 * array of AppId strings) so it stays gone across sessions and devices.
 *
 * A one-line `tagline` is always visible under the page title regardless
 * of dismissal — it's the "what is this" anchor for users who dismissed
 * the card months ago and forgot.
 *
 * Persistence pattern mirrors useViewLens / useAppPalette: a module-level
 * ref hydrates once from `/api/directus/users/me`; reads come from the
 * server-attached `user` until then. Writes go through `updateMe()`.
 *
 * Tolerates a missing `dismissed_app_intros` field on the server (orgs
 * that haven't run `scripts/setup-app-intros-field.ts` yet) — treats null
 * as "nothing dismissed".
 */
import type { AppId } from '~/composables/useAppAccent';

export type AppIntroId = Extract<AppId, 'clients' | 'work' | 'money' | 'marketing' | 'organization'>;

export interface AppIntroContent {
	tagline: string;
	intro: {
		title: string;
		body: string;
		bullets?: string[];
	};
}

/**
 * Registry of intro + tagline copy per app. Edit here to update wording —
 * AppIntroCard and AppHeader both read from this map.
 *
 * Voice: grounded, specific to what Earnest does. Avoid "Manage your X here".
 * Lead with the relational hook (every relationship / every dollar / every
 * project) so the tagline doubles as a positioning line.
 */
export const APP_INTROS: Record<AppIntroId, AppIntroContent> = {
	clients: {
		tagline: 'Every relationship, in one place.',
		intro: {
			title: 'Clients is your relationship engine.',
			body:
				'From a cold lead to a repeat client, Clients tracks who you know, ' +
				'what they\'ve bought, and what they might buy next. Contacts, partners, ' +
				'and accounts share one timeline so nothing falls through.',
			bullets: [
				'Lifecycle stages — Lead → Prospect → Active → Churned',
				'Partner network — who refers who, who shares clients',
				'Sourced attribution — every closed client traces back to its lead',
			],
		},
	},
	work: {
		tagline: 'Projects, tickets, meetings — all together.',
		intro: {
			title: 'Work is the operational core.',
			body:
				'Gantt for the plan. Tickets for the daily flow. Meetings for what ' +
				'comes out of conversation. Everything you do for a client lives here, ' +
				'tagged to the project it belongs to.',
			bullets: [
				'Unified Gantt across every active project',
				'Meeting recaps auto-link to the project they came from',
				'Tickets and tasks share one assignment + due-date model',
			],
		},
	},
	money: {
		tagline: 'Every dollar in, every dollar out.',
		intro: {
			title: 'Money is your studio\'s ledger.',
			body:
				'Proposals become contracts become invoices become payments — without ' +
				're-entering data at any step. Cash flow, retainers, and time-tracked ' +
				'work feed the same numbers on the same screen.',
			bullets: [
				'Stripe-connected invoicing with manual-payment fallback',
				'Time blocks promote straight onto invoice line items',
				'Contracts and proposals share one library of reusable blocks',
			],
		},
	},
	marketing: {
		tagline: 'Posts, campaigns, and the inbox they trigger.',
		intro: {
			title: 'Marketing is where you reach out.',
			body:
				'Social posts, email campaigns, and the recommendations engine that ' +
				'tells you who to follow up with next. Every post and touch is tagged ' +
				'to the client or campaign it serves.',
			bullets: [
				'Cross-channel composer with per-platform spec sheets',
				'Recommendation feed surfaces stale contacts + cold leads',
				'Campaigns roll up into the Clean-Gantt view alongside projects',
			],
		},
	},
	organization: {
		tagline: 'Your studio\'s settings, team, and brand.',
		intro: {
			title: 'Organization is the workspace itself.',
			body:
				'Team members, roles, branding, billing, integrations — the dials ' +
				'that shape how the rest of Earnest works for your studio. ' +
				'Change something here and it propagates everywhere.',
			bullets: [
				'Branded email shell + sender domain + reply-to',
				'Plan + add-ons (Plaid bank sync, AI tokens, seats)',
				'Team roles, hats, and per-user app palette + layout',
			],
		},
	},
};

export const APP_INTRO_IDS: readonly AppIntroId[] = Object.keys(APP_INTROS) as AppIntroId[];

function isAppIntroId(v: unknown): v is AppIntroId {
	return typeof v === 'string' && (APP_INTRO_IDS as readonly string[]).includes(v);
}

/** Module-level state — shared across all composable callers. */
const dismissedPersisted = ref<Set<AppIntroId>>(new Set());
/**
 * Session-only re-shown apps. When the user clicks the reopen icon we
 * locally re-enable the card *without* writing to the server, so the
 * persisted dismissal stays intact until they explicitly dismiss again.
 */
const reopenedThisSession = ref<Set<AppIntroId>>(new Set());
let hydrationPromise: Promise<void> | null = null;

function parseDismissed(raw: unknown): Set<AppIntroId> {
	if (!Array.isArray(raw)) return new Set();
	const out = new Set<AppIntroId>();
	for (const v of raw) if (isAppIntroId(v)) out.add(v);
	return out;
}

async function hydrateFromServer() {
	if (hydrationPromise) return hydrationPromise;
	hydrationPromise = (async () => {
		try {
			const me = (await $fetch('/api/directus/users/me', {
				method: 'GET',
				params: { fields: 'dismissed_app_intros' },
			})) as Record<string, any>;
			dismissedPersisted.value = parseDismissed(me?.dismissed_app_intros);
		} catch {
			dismissedPersisted.value = new Set();
		}
	})();
	return hydrationPromise;
}

export function useAppIntros() {
	const { user } = useDirectusAuth();
	const { updateMe } = useDirectusUsers();

	if (import.meta.client && !hydrationPromise) {
		// Seed from the auth-attached user immediately so SSR-hydrated reads
		// don't flash the card before the /me round-trip resolves.
		const seeded = parseDismissed((user.value as any)?.dismissed_app_intros);
		if (seeded.size) dismissedPersisted.value = seeded;
		hydrateFromServer();
	}

	function isDismissed(id: AppIntroId): boolean {
		if (reopenedThisSession.value.has(id)) return false;
		return dismissedPersisted.value.has(id);
	}

	async function dismiss(id: AppIntroId): Promise<void> {
		if (dismissedPersisted.value.has(id) && !reopenedThisSession.value.has(id)) return;
		// Clear any session-level re-open so persisted state wins.
		reopenedThisSession.value.delete(id);
		const next = new Set(dismissedPersisted.value);
		next.add(id);
		dismissedPersisted.value = next;
		try {
			await updateMe({ dismissed_app_intros: Array.from(next) } as any);
		} catch (err) {
			console.warn('[useAppIntros] persist dismissal failed; keeping local override', err);
		}
	}

	/**
	 * Locally re-show a dismissed intro for the rest of this session. Does
	 * NOT write to the server — the user's persisted "I don't need this"
	 * stays intact. If they dismiss again, `dismiss()` re-writes.
	 */
	function reopen(id: AppIntroId): void {
		const next = new Set(reopenedThisSession.value);
		next.add(id);
		reopenedThisSession.value = next;
	}

	function getContent(id: AppIntroId): AppIntroContent {
		return APP_INTROS[id];
	}

	return { isDismissed, dismiss, reopen, getContent };
}
