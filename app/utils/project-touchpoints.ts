// project-touchpoints.ts
//
// Lightweight communication-log taxonomy for projects, modeled on CardDesk's
// activity touch points (see carddesk-constants.ts / cd_activities). A
// touchpoint records an effort to communicate ("Sent email", "Phone call") and
// can be marked as having received a response — so a team can track outreach and
// follow-up at a glance without opening a full event/milestone.

export interface ProjectTouchpointType {
	key: string;
	label: string;
	/** Verb used in the log timeline, e.g. "Emailed", "Called". */
	verb: string;
	icon: string; // lucide icon name
}

export const PROJECT_TOUCHPOINT_TYPES: ProjectTouchpointType[] = [
	{ key: 'email', label: 'Email', verb: 'Emailed', icon: 'lucide:mail' },
	{ key: 'call', label: 'Call', verb: 'Called', icon: 'lucide:phone' },
	{ key: 'text', label: 'Text', verb: 'Texted', icon: 'lucide:message-square' },
	{ key: 'meeting', label: 'Meeting', verb: 'Met with', icon: 'lucide:handshake' },
	{ key: 'note', label: 'Note', verb: 'Noted', icon: 'lucide:sticky-note' },
	{ key: 'other', label: 'Other', verb: 'Reached out', icon: 'lucide:message-circle' },
];

export const PROJECT_TOUCHPOINT_ICON: Record<string, string> = Object.fromEntries(
	PROJECT_TOUCHPOINT_TYPES.map((t) => [t.key, t.icon]),
);
export const PROJECT_TOUCHPOINT_LABEL: Record<string, string> = Object.fromEntries(
	PROJECT_TOUCHPOINT_TYPES.map((t) => [t.key, t.label]),
);
export const PROJECT_TOUCHPOINT_VERB: Record<string, string> = Object.fromEntries(
	PROJECT_TOUCHPOINT_TYPES.map((t) => [t.key, t.verb]),
);
export const PROJECT_TOUCHPOINT_FALLBACK_ICON = 'lucide:message-circle';

/** A tagged participant on a touchpoint. Stored as JSON so we can mix people
 *  from different collections (team members vs. client/portal contacts) without
 *  a junction table per source. */
export interface TouchpointParticipant {
	kind: 'member' | 'contact' | 'portal';
	id: string;
	name: string;
}
