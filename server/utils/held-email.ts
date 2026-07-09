// server/utils/held-email.ts
/**
 * Persist a held MONEY email as a draft in `held_emails` (the draft outbox).
 *
 * Called from the money-email routes (invoicenotice / paymentnotification) when
 * `evaluateMoneyGate` holds a send. The rendered SendGrid `message` is stored
 * verbatim in `payload` so a later flush (POST /api/email/held/[id]/send) can
 * re-transmit byte-for-byte. Denormalized columns power the /email/activity
 * "Held" list without parsing the payload.
 *
 * Fire-and-forget + fail-soft: any error (collection unmigrated, transient
 * Directus failure) is swallowed and logged. Holding a money email must NEVER
 * throw back into the send route — the gate decision already stands; persistence
 * is a best-effort audit/review convenience.
 */
import { createItem } from '@directus/sdk';

export interface PersistHeldEmailInput {
	organization: string | null | undefined;
	channel: 'invoice_notice' | 'payment_notification';
	to: string | null | undefined;
	subject: string;
	amount?: number | string | null;
	reason: string;
	/** Full SendGrid message object — stored verbatim for exact re-send. */
	message: unknown;
	sourceCollection?: string | null;
	sourceId?: string | number | null;
}

export async function persistHeldEmail(input: PersistHeldEmailInput): Promise<string | null> {
	try {
		const directus = getServerDirectus();
		const row = await directus.request(
			createItem(
				'held_emails' as any,
				{
					organization: input.organization ? String(input.organization) : null,
					channel: input.channel,
					to_email: input.to ? String(input.to) : null,
					subject: input.subject,
					amount: input.amount != null && input.amount !== '' ? String(input.amount) : null,
					reason: input.reason,
					status: 'held',
					payload: input.message,
					source_collection: input.sourceCollection ?? null,
					source_id: input.sourceId != null ? String(input.sourceId) : null,
				} as any,
				{ fields: ['id'] as any },
			),
		);
		const id = (row as any)?.id ?? null;
		if (id) console.log(`[held-email] persisted draft ${id} (${input.channel})`);
		return id;
	} catch (err: any) {
		console.error('[held-email] persist failed (collection unmigrated?):', err?.message || err);
		return null;
	}
}
