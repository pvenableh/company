// shared/ai-autonomy.ts
//
// The Earnest "trust dial" — a PER-USER autonomy tier (0–3) deciding how much of
// Earnest's proposed work runs without a manual approval. Pure logic + metadata,
// shared by the server (auto-approval decision) and the client (the dial UI), so
// the tiers can never drift between them.
//
// Hard SAFETY FLOOR: outbound / money / external-calendar actions (email,
// invoices, meetings) ALWAYS require a human OK, at every tier. Auto-run actions
// still land in the ai_actions audit trail (as `executed`) and stay undoable
// where the executor supports it. Only the gated PROPOSAL_TOOLS are affected.

/** Actions that NEVER auto-run, no matter the tier (outbound / money / external). */
export const AUTONOMY_SAFETY_FLOOR: ReadonlySet<string> = new Set([
	'send_email',
	'create_invoice',
	'book_meeting',
	'reschedule_meeting',
	'cancel_meeting',
]);

/** What each tier auto-runs (cumulative; safety-floor tools are never included). */
const TIER_TOOLS: Record<1 | 2 | 3, ReadonlySet<string>> = {
	1: new Set(['create_ticket', 'add_event']),
	2: new Set(['create_ticket', 'add_event', 'create_project', 'create_content_plan']),
	3: new Set(['create_ticket', 'add_event', 'create_project', 'create_content_plan', 'draft_social_posts', 'create_campaign']),
};

export const AUTONOMY_MIN = 0;
export const AUTONOMY_MAX = 3;

export interface AutonomyTierInfo {
	tier: 0 | 1 | 2 | 3;
	label: string;
	blurb: string;
}

/** Human-facing tier ladder — shared by the dial UI. */
export const AUTONOMY_TIERS: readonly AutonomyTierInfo[] = [
	{ tier: 0, label: 'Ask me everything', blurb: 'Every action waits for your OK.' },
	{ tier: 1, label: 'Handle the small stuff', blurb: 'Tickets and phases run on their own.' },
	{ tier: 2, label: 'Draft freely', blurb: 'Also spins up projects and content plans.' },
	{ tier: 3, label: 'Full partner', blurb: 'Runs most work. Email, money & meetings still ask.' },
];

/** Clamp any stored/incoming value to a valid tier. */
export function clampTier(v: unknown): 0 | 1 | 2 | 3 {
	const n = Math.round(Number(v));
	if (!Number.isFinite(n) || n < AUTONOMY_MIN) return 0;
	if (n > AUTONOMY_MAX) return 3;
	return n as 0 | 1 | 2 | 3;
}

/**
 * Should a proposed tool auto-run at this tier? False for the safety floor and
 * for tier 0, always. Defensive: unknown tools never auto-run.
 */
export function shouldAutoApprove(toolName: string, tier: number): boolean {
	const t = clampTier(tier);
	if (t < 1) return false;
	if (AUTONOMY_SAFETY_FLOOR.has(toolName)) return false;
	return TIER_TOOLS[t as 1 | 2 | 3].has(toolName);
}
