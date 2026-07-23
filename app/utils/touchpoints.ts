// touchpoints.ts
//
// Communication-log taxonomy, modeled on CardDesk's activity touch points (see
// carddesk-constants.ts / cd_activities). A touchpoint records an effort to
// communicate ("Sent email", "Phone call") and can be marked as having received
// a response — so a team can track outreach and follow-up at a glance. Attaches
// to a client, project, and/or contacts (see the `touchpoints` collection).

export interface TouchpointType {
	key: string;
	label: string;
	/** Verb used in the log timeline, e.g. "Emailed", "Called". */
	verb: string;
	icon: string; // lucide icon name
}

export const TOUCHPOINT_TYPES: TouchpointType[] = [
	{ key: 'email', label: 'Email', verb: 'Emailed', icon: 'lucide:mail' },
	{ key: 'call', label: 'Call', verb: 'Called', icon: 'lucide:phone' },
	{ key: 'text', label: 'Text', verb: 'Texted', icon: 'lucide:message-square' },
	{ key: 'meeting', label: 'Meeting', verb: 'Met with', icon: 'lucide:handshake' },
	{ key: 'note', label: 'Note', verb: 'Noted', icon: 'lucide:sticky-note' },
	{ key: 'other', label: 'Other', verb: 'Reached out', icon: 'lucide:message-circle' },
];

export const TOUCHPOINT_ICON: Record<string, string> = Object.fromEntries(
	TOUCHPOINT_TYPES.map((t) => [t.key, t.icon]),
);
export const TOUCHPOINT_LABEL: Record<string, string> = Object.fromEntries(
	TOUCHPOINT_TYPES.map((t) => [t.key, t.label]),
);
export const TOUCHPOINT_VERB: Record<string, string> = Object.fromEntries(
	TOUCHPOINT_TYPES.map((t) => [t.key, t.verb]),
);
export const TOUCHPOINT_FALLBACK_ICON = 'lucide:message-circle';

/** A non-contact tag on a touchpoint (team member / portal user), stored in the
 *  `participants` JSON. Client contacts are a real m2m relation, not this. */
export interface TouchpointParticipant {
	kind: 'member' | 'contact' | 'portal';
	id: string;
	name: string;
}
