/**
 * useAppIntros — opt-in "what is this app?" intro cards on every /apps/*
 * landing.
 *
 * Each top-level app has a short intro registered here. The card is HIDDEN
 * by default — the user clicks the `info` icon in AppHeader to open it
 * for the current session. The "X" inside the card closes it again.
 *
 * Session-only state — no persistence. The intro is reference material
 * the user occasionally wants to re-read, not a first-run onboarding
 * banner that needs to be dismissed across sessions.
 *
 * The always-visible `tagline` under the page title is the permanent
 * "what is this" anchor; the card is the deeper read.
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

/** Apps the user has opened the intro for in this session. */
const openedThisSession = ref<Set<AppIntroId>>(new Set());

export function useAppIntros() {
	function isOpen(id: AppIntroId): boolean {
		return openedThisSession.value.has(id);
	}

	function open(id: AppIntroId): void {
		if (openedThisSession.value.has(id)) return;
		const next = new Set(openedThisSession.value);
		next.add(id);
		openedThisSession.value = next;
	}

	function close(id: AppIntroId): void {
		if (!openedThisSession.value.has(id)) return;
		const next = new Set(openedThisSession.value);
		next.delete(id);
		openedThisSession.value = next;
	}

	function toggle(id: AppIntroId): void {
		openedThisSession.value.has(id) ? close(id) : open(id);
	}

	function getContent(id: AppIntroId): AppIntroContent {
		return APP_INTROS[id];
	}

	return { isOpen, open, close, toggle, getContent };
}
