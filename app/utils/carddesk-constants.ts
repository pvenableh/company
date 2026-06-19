// carddesk-constants.ts
//
// Mirrors CardDesk's master activity/rating taxonomy so Earnest's CardDesk
// surface stays 1:1 with the source app. Kept in sync with the CardDesk repo:
//   ~/Sites/earnest/carddesk/website/app/composables/useConstants.ts (ACT_TYPES / RATINGS)
//
// `manual: true` entries are real communication touch points a person logs;
// `manual: false` entries are lifecycle / system events CardDesk emits
// automatically (still rendered here so synced activities show the right
// icon + label). Per product decision (2026-06-19) the manual "Log activity"
// picker exposes ALL categories.

export interface CdTouchpoint {
	key: string;
	label: string;
	icon: string; // lucide icon name
	manual: boolean;
}

export const CD_TOUCHPOINTS: CdTouchpoint[] = [
	// ── Communication touch points (manually logged) ──────────────────────────
	{ key: 'email', label: 'Email', icon: 'lucide:mail', manual: true },
	{ key: 'text', label: 'Text', icon: 'lucide:smartphone', manual: true },
	{ key: 'call', label: 'Call', icon: 'lucide:phone', manual: true },
	{ key: 'meeting', label: 'Meeting', icon: 'lucide:handshake', manual: true },
	{ key: 'linkedin', label: 'LinkedIn', icon: 'lucide:link', manual: true },
	{ key: 'other', label: 'Other', icon: 'lucide:message-circle', manual: true },
	// ── Lifecycle / system events (auto-emitted by CardDesk) ──────────────────
	{ key: 'contact_added', label: 'Contact Added', icon: 'lucide:user-plus', manual: false },
	{ key: 'card_scanned', label: 'Card Scanned', icon: 'lucide:camera', manual: false },
	{ key: 'stage_change', label: 'Stage Change', icon: 'lucide:git-branch', manual: false },
	{ key: 'converted_lead', label: 'Converted Lead', icon: 'lucide:target', manual: false },
	{ key: 'converted_client', label: 'Converted to Client', icon: 'lucide:badge-check', manual: false },
	// ── Earnest-only lifecycle (no CardDesk equivalent) ───────────────────────
	{ key: 'promoted_to_earnest', label: 'Promoted to Earnest', icon: 'lucide:arrow-up-right', manual: false },
];

// Lookup maps for rendering any activity row by its `type` key.
export const CD_TOUCHPOINT_ICON: Record<string, string> = Object.fromEntries(
	CD_TOUCHPOINTS.map((t) => [t.key, t.icon]),
);
export const CD_TOUCHPOINT_LABEL: Record<string, string> = Object.fromEntries(
	CD_TOUCHPOINTS.map((t) => [t.key, t.label]),
);
export const CD_TOUCHPOINT_FALLBACK_ICON = 'lucide:message-circle';

// CardDesk signature brand gradient (green → blue) with dark text — used on
// primary CardDesk CTAs so they read as CardDesk surfaces, not Earnest ones.
export const CD_BRAND_GRADIENT =
	'bg-gradient-to-br from-[#00ff87] to-[#4da6ff] text-[#06121f]';

// The four contact rating tiers (no orange — Earnest maps these onto its own
// design-system status colours in the component).
export const CD_RATINGS = [
	{ key: 'hot', label: 'Hot' },
	{ key: 'warm', label: 'Warm' },
	{ key: 'nurture', label: 'Nurture' },
	{ key: 'cold', label: 'Cold' },
] as const;
