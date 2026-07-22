/**
 * useEarnestActions — the ONE catalog of "things Earnest can do here", keyed by
 * entity type.
 *
 * This was previously duplicated verbatim in two places (EarnestPanel's
 * ENTITY_ACTIONS and CreateWithEarnest's ACTIONS) that drifted apart. Both now
 * read from here, so the docked panel's action chips and the inline
 * "Create with Earnest" sheet always offer the same, complete set.
 *
 * Every action funnels through openEarnestPanel(prompt): Earnest drafts it in
 * the conversation and nothing is created until the user approves the resulting
 * proposal (the HITL ai_actions queue). Multi-block artifacts (proposals, social
 * plans, newsletters) also have a richer home on the Generative Canvas, reached
 * via the "Draft with Earnest" buttons in those workspaces.
 */

export interface EarnestAction {
	label: string;
	icon: string;
	prompt: string;
}

const CATALOG: Record<string, EarnestAction[]> = {
	client: [
		{ label: 'New project', icon: 'lucide:folder-plus', prompt: 'Create a new project for this client with a short timeline of phases and a few tasks under each.' },
		{ label: 'Proposal & contract', icon: 'lucide:file-text', prompt: 'Draft a proposal and a contract for this client based on what you know about them.' },
		{ label: 'Invoice', icon: 'lucide:receipt', prompt: 'Create an invoice for this client for recent work.' },
		{ label: 'Social posts', icon: 'lucide:megaphone', prompt: 'Draft a few social posts for this client — real, on-brand captions I can review and edit.' },
		{ label: 'Campaign', icon: 'lucide:target', prompt: 'Spin up a draft marketing campaign for this client with a clear goal.' },
		{ label: 'Ticket', icon: 'lucide:ticket', prompt: 'Create a ticket for this client for a specific request, with a couple of tasks.' },
		{ label: 'Task', icon: 'lucide:check-square', prompt: 'Add a follow-up task for this client.' },
		{ label: 'Email', icon: 'lucide:mail', prompt: 'Draft a follow-up email to this client.' },
	],
	project: [
		{ label: 'Add a phase / event', icon: 'lucide:flag', prompt: 'Add a phase to this project with a couple of tasks under it.' },
		{ label: 'Add tasks', icon: 'lucide:check-square', prompt: 'Add a few tasks to this project.' },
		{ label: 'Ticket', icon: 'lucide:ticket', prompt: 'Create a ticket on this project for a specific request, with a couple of tasks.' },
		{ label: 'Invoice', icon: 'lucide:receipt', prompt: 'Create an invoice for this project\'s client for recent work.' },
		{ label: 'Reschedule', icon: 'lucide:calendar-clock', prompt: 'Reschedule this project — push the dates out by two weeks and cascade to events and tasks.' },
		{ label: 'Update a field', icon: 'lucide:refresh-cw', prompt: 'Change this project\'s status.' },
	],
	lead: [
		{ label: 'Proposal & contract', icon: 'lucide:file-text', prompt: 'Draft a proposal and contract for this lead.' },
		{ label: 'Task', icon: 'lucide:check-square', prompt: 'Add a follow-up task for this lead.' },
		{ label: 'Email', icon: 'lucide:mail', prompt: 'Draft an outreach email to this lead.' },
	],
	invoice: [
		{ label: 'Payment reminder', icon: 'lucide:mail', prompt: 'Draft a payment reminder email for this invoice to the client.' },
		{ label: 'Extend due date', icon: 'lucide:calendar-clock', prompt: 'Push this invoice\'s due date out by two weeks.' },
		{ label: 'Update status', icon: 'lucide:refresh-cw', prompt: 'Change this invoice\'s status.' },
	],
	content_plan: [
		{ label: 'Draft a content plan', icon: 'lucide:calendar', prompt: 'Put together a draft content plan for this — objective, a few themes, and a short strategy.' },
		{ label: 'Plan next month', icon: 'lucide:calendar-plus', prompt: 'Create a monthly content plan for next month with a handful of content themes.' },
		{ label: 'Social posts', icon: 'lucide:megaphone', prompt: 'Draft a handful of social posts for this plan — real, on-brand captions I can review and edit.' },
	],
	marketing_campaign: [
		{ label: 'Social posts', icon: 'lucide:megaphone', prompt: 'Draft a few social posts for this campaign — real, on-brand captions I can review and edit.' },
		{ label: 'Content plan', icon: 'lucide:calendar', prompt: 'Put together a draft content plan to support this campaign — objective, a few themes, and a short strategy.' },
	],
	proposal: [
		{ label: 'Turn into contract', icon: 'lucide:file-signature', prompt: 'Turn this proposal into a contract — draft a contract (targets: contract) based on this proposal\'s scope and pricing, linked to the same lead.' },
	],
	contract: [
		{ label: 'Create invoice', icon: 'lucide:receipt', prompt: 'Create an invoice from this contract — bill its client for the contract amount.' },
	],
	project_event: [
		{ label: 'Bill this milestone', icon: 'lucide:receipt', prompt: 'Create an invoice to bill this payment milestone for the project client.' },
	],
};

/** Normalize the various project entity-type spellings to the 'project' key. */
function normalizeKey(entityType: string): string {
	return entityType === 'work-project' || /(^|_)project$/.test(entityType) ? 'project' : entityType;
}

/** The action list for an entity type ([] when unknown / no entity). */
export function earnestActionsFor(entityType?: string | null): EarnestAction[] {
	if (!entityType) return [];
	return CATALOG[normalizeKey(entityType)] || [];
}

export function useEarnestActions() {
	return { earnestActionsFor };
}
