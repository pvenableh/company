// server/utils/write-timeline.ts
/**
 * writeClientTimeline — append one row to the `client_timeline` CRM log.
 *
 * The "return leg" writer: call this the moment a client-side action lands
 * (contract signed, invoice paid, proposal accepted, plan approved, work
 * rated, changes requested). The row shows on the client's Activity tab,
 * merged with the read-time composer in
 * `server/api/apps/clients/[id]/activity.get.ts`.
 *
 * Contract:
 *   - Fire-and-forget + self-catching. A timeline-write failure must NEVER
 *     fail the real sign/pay/approve flow — callers may `void` this.
 *   - Uses the admin/server token (getTypedDirectus). These writes happen
 *     behind a public/portal request whose policy can't create timeline rows.
 *   - No-ops silently if org or client is missing (can't scope the row) or if
 *     the `client_timeline` collection hasn't been provisioned yet
 *     (scripts/setup-client-timeline.ts) — the catch swallows the 403/404 so
 *     nothing breaks before the migration is applied on an environment.
 */
import { createItem } from '@directus/sdk';

export type ClientTimelineVerb =
	| 'contract.signed'
	| 'invoice.paid'
	| 'proposal.accepted'
	| 'proposal.declined'
	| 'plan.approved'
	| 'csat.submitted'
	| 'changes.requested';

export interface WriteClientTimelineInput {
	organizationId: string | null | undefined;
	clientId: string | null | undefined;
	verb: ClientTimelineVerb | string;
	/** One-line summary shown on the timeline. */
	title: string;
	subtitle?: string | null;
	actorType?: 'client' | 'staff' | 'system';
	actorName?: string | null;
	/** The directus user, when the actor was authenticated (null for anon portal). */
	actorUserId?: string | null;
	sourceCollection?: string | null;
	sourceId?: string | number | null;
	/** Money amount in dollars, for payment events. */
	amount?: number | null;
	/** App-relative link the row points at. */
	href?: string | null;
	/** Lucide icon name. */
	icon?: string | null;
	metadata?: Record<string, any> | null;
	/** Override the Directus client (defaults to the admin token). */
	directus?: any;
}

export async function writeClientTimeline(input: WriteClientTimelineInput): Promise<void> {
	// Can't scope the row without both org + client — skip rather than write orphans.
	if (!input.organizationId || !input.clientId) return;

	try {
		const directus = input.directus || getTypedDirectus();
		// `client_timeline` isn't in the generated Schema until
		// scripts/setup-client-timeline.ts + generate:types run, so cast the
		// SDK helper to keep this compiling pre-migration.
		await directus.request(
			(createItem as any)('client_timeline', {
				organization: input.organizationId,
				client: input.clientId,
				verb: input.verb,
				title: input.title,
				subtitle: input.subtitle ?? null,
				actor_type: input.actorType ?? 'client',
				actor_name: input.actorName ?? null,
				actor_user: input.actorUserId ?? null,
				source_collection: input.sourceCollection ?? null,
				source_id: input.sourceId != null ? String(input.sourceId) : null,
				amount: input.amount != null ? input.amount : null,
				href: input.href ?? null,
				icon: input.icon ?? null,
				metadata: input.metadata ?? null,
			} as any),
		);
	} catch (err: any) {
		// Non-fatal by design — see the file header.
		console.warn('[write-timeline] failed (non-fatal):', err?.message || err);
	}
}
