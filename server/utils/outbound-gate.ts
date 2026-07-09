// server/utils/outbound-gate.ts
/**
 * Outbound email GATE — the per-org, per-template allow-list that decides
 * whether a genuinely client-facing email is actually transmitted or held as a
 * rendered-but-unsent draft.
 *
 * WHY THIS EXISTS (Sprint 2 email enablement)
 * The AI `send_email` executor used to gate on a single global boolean
 * (`AI_SEND_EMAIL_DRYRUN`). Flipping that one switch to transmit turns email on
 * for EVERY org at once, and every send renders through the one `generic`
 * template — there was no per-template whitelist. That's a merge, not a rollout.
 *
 * This gate replaces that boolean with a staged allow-list so email can be
 * enabled NARROW (one org, one template) and widened by appending ids — with a
 * global kill-switch on top. It is deliberately env-driven: no schema change, no
 * prod Directus write, and reverting is just removing an env value.
 *
 * DECISION INPUTS (all env, read fresh each call so a redeploy is the only
 * thing needed to change scope):
 *   - OUTBOUND_EMAIL_KILL        — 'true' hard-disables ALL transmits (master
 *                                  off-switch; overrides the allow-lists).
 *   - OUTBOUND_EMAIL_ALLOWED_ORGS      — comma-separated org ids that MAY
 *                                        transmit. DEFAULT EMPTY = deny all.
 *   - OUTBOUND_EMAIL_ALLOWED_TEMPLATES — comma-separated template names that MAY
 *                                        transmit. DEFAULT 'generic'.
 *
 * A channel is a coarse label for the kind of send (ai_email, contract_signature)
 * so the gate decision + send-log can be filtered by intent later. It does not
 * change the allow-list math today, but it is recorded on every decision.
 *
 * `evaluateOutboundGate` NEVER throws and has no side effects — callers use the
 * boolean to decide transmit-vs-draft, and persist `reason` into their send-log
 * so a human can see exactly why a given email was or wasn't transmitted.
 */

export type OutboundChannel = 'ai_email' | 'contract_signature' | string;

export interface OutboundGateDecision {
	/** True only when kill-switch is off AND org is allow-listed AND template is allow-listed. */
	allowed: boolean;
	/** Human-readable reason — always set, safe to store in a send-log / show in UI. */
	reason: string;
	/** Echo of the inputs, for the audit trail. */
	channel: OutboundChannel;
	orgId: string | null;
	template: string;
}

function parseList(raw: string | undefined): string[] {
	if (!raw) return [];
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export interface OutboundGateInput {
	channel: OutboundChannel;
	orgId: string | null | undefined;
	/** Template name being rendered (default 'generic' — the only shipped one). */
	template?: string;
}

export function evaluateOutboundGate(input: OutboundGateInput): OutboundGateDecision {
	const channel = input.channel;
	const orgId = input.orgId ? String(input.orgId) : null;
	const template = (input.template || 'generic').trim();

	const base = { channel, orgId, template };

	// 1. Master kill-switch — overrides everything.
	if (process.env.OUTBOUND_EMAIL_KILL === 'true') {
		return { ...base, allowed: false, reason: 'outbound email disabled (OUTBOUND_EMAIL_KILL=true)' };
	}

	// 2. Org allow-list (default empty = deny all).
	const allowedOrgs = parseList(process.env.OUTBOUND_EMAIL_ALLOWED_ORGS);
	if (!orgId) {
		return { ...base, allowed: false, reason: 'no organization on the send — cannot gate, held as draft' };
	}
	if (!allowedOrgs.includes(orgId)) {
		return {
			...base,
			allowed: false,
			reason: `org ${orgId} is not on the outbound allow-list (OUTBOUND_EMAIL_ALLOWED_ORGS) — held as draft`,
		};
	}

	// 3. Template allow-list (default 'generic').
	const rawTemplates = process.env.OUTBOUND_EMAIL_ALLOWED_TEMPLATES;
	const allowedTemplates = rawTemplates ? parseList(rawTemplates) : ['generic'];
	if (!allowedTemplates.includes(template)) {
		return {
			...base,
			allowed: false,
			reason: `template "${template}" is not on the outbound allow-list (OUTBOUND_EMAIL_ALLOWED_TEMPLATES) — held as draft`,
		};
	}

	return { ...base, allowed: true, reason: `allowed: org ${orgId} + template "${template}" are on the outbound allow-list` };
}

/**
 * Convenience for surfaces that just want to know if ANY org can transmit right
 * now (e.g. a banner "email sending is enabled for N orgs"). Cheap, no I/O.
 */
export function outboundEmailEnabledGlobally(): boolean {
	if (process.env.OUTBOUND_EMAIL_KILL === 'true') return false;
	return parseList(process.env.OUTBOUND_EMAIL_ALLOWED_ORGS).length > 0;
}

export interface MoneyGateDecision {
	/** True when money gating is OFF (default) OR the org is money-allow-listed. */
	allowed: boolean;
	/** True only when OUTBOUND_EMAIL_GATE_MONEY is on — i.e. the allow-list was actually consulted. */
	gated: boolean;
	/** Human-readable reason — always set, safe to log / show in a UI. */
	reason: string;
	orgId: string | null;
}

/**
 * Gate for client-facing MONEY email (invoice notices, payment receipts).
 *
 * These are transactional and historically ALWAYS send — they bypass the general
 * `evaluateOutboundGate` entirely. The rollout intent is "client-facing money
 * stays drafts" even for orgs whose *general* email is already enabled, so money
 * gets its OWN switch and its OWN allow-list, independent of
 * OUTBOUND_EMAIL_ALLOWED_ORGS.
 *
 * DEFAULT-OFF, on purpose: when OUTBOUND_EMAIL_GATE_MONEY !== 'true' this returns
 * `allowed:true` unconditionally, so money email sends exactly as it does today.
 * NOTHING changes on deploy until the flag is deliberately set — enabling money
 * gating is an explicit, reversible act (remove the env value to revert).
 *
 * When ON:
 *   - OUTBOUND_EMAIL_KILL=true            → deny (shared master off-switch).
 *   - OUTBOUND_EMAIL_ALLOWED_MONEY_ORGS   → comma-separated org ids that MAY send
 *                                           money email. DEFAULT EMPTY = deny all
 *                                           (every money email held as a draft).
 */
export function evaluateMoneyGate(orgId: string | null | undefined): MoneyGateDecision {
	const id = orgId ? String(orgId) : null;

	// Default OFF — preserve today's always-send behavior until explicitly enabled.
	if (process.env.OUTBOUND_EMAIL_GATE_MONEY !== 'true') {
		return { allowed: true, gated: false, orgId: id, reason: 'money gating off (OUTBOUND_EMAIL_GATE_MONEY unset) — sent as normal' };
	}

	if (process.env.OUTBOUND_EMAIL_KILL === 'true') {
		return { allowed: false, gated: true, orgId: id, reason: 'outbound email disabled (OUTBOUND_EMAIL_KILL=true) — held as draft' };
	}
	if (!id) {
		return { allowed: false, gated: true, orgId: id, reason: 'no organization on the money send — cannot gate, held as draft' };
	}
	const allowedMoneyOrgs = parseList(process.env.OUTBOUND_EMAIL_ALLOWED_MONEY_ORGS);
	if (!allowedMoneyOrgs.includes(id)) {
		return {
			allowed: false,
			gated: true,
			orgId: id,
			reason: `org ${id} is not on the money allow-list (OUTBOUND_EMAIL_ALLOWED_MONEY_ORGS) — held as draft`,
		};
	}
	return { allowed: true, gated: true, orgId: id, reason: `allowed: org ${id} is on the money allow-list` };
}
