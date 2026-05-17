/**
 * Enqueue per-recipient personalization for a marketing touch.
 *
 * POST /api/marketing/touches/[id]/personalize
 *
 * Validates, then creates one `pending` row in marketing_touch_variants per
 * eligible contact in the campaign's audience_snapshot. Returns immediately
 * with the queue state — does NOT call the LLM. The worker cron at
 * /api/marketing/cron/process-personalization-queue picks up pending rows
 * and processes them.
 *
 * Idempotent: re-calling skips contacts that already have a `completed`
 * variant, and re-enqueues `failed` ones (deletes + recreates as pending so
 * the worker treats them fresh).
 *
 * Gates:
 *   - touch.kind === 'email' (social touches don't have per-recipient variants)
 *   - touch.status in ['pending', 'scheduled']
 *   - touch.audience_target !== 'project_contact' (single-recipient touches
 *     don't need variants — base + {{first_name}} is enough)
 *   - campaign.audience_snapshot.contact_ids non-empty
 *   - audience size <= MAX_PERSONALIZE_AUDIENCE (defends the worker queue
 *     from being flooded by a misconfigured 10K-contact campaign)
 */
import { createItem, deleteItems, readItem, readItems, updateItem } from '@directus/sdk';
import type { MarketingTouchVariant } from '~~/shared/marketing-persistence';

const MAX_PERSONALIZE_AUDIENCE = 200;

export default defineEventHandler(async (event) => {
	const idParam = getRouterParam(event, 'id');
	const touchId = idParam ? Number(idParam) : NaN;
	if (!Number.isFinite(touchId)) {
		throw createError({ statusCode: 400, message: 'Touch ID must be numeric' });
	}

	const directus = getTypedDirectus();

	const touch = await directus
		.request(
			readItem('marketing_touches', touchId, {
				fields: [
					'id',
					'organization',
					'campaign',
					'kind',
					'status',
					'audience_target',
					'personalization_state',
				],
			}),
		)
		.catch(() => null) as any;

	if (!touch) {
		throw createError({ statusCode: 404, message: 'Touch not found' });
	}
	if (touch.kind !== 'email') {
		throw createError({
			statusCode: 409,
			message: 'Personalization is only supported for email touches.',
		});
	}
	if (!['pending', 'scheduled'].includes(touch.status)) {
		throw createError({
			statusCode: 409,
			message: `Touch is ${touch.status}; cannot personalize.`,
		});
	}
	if (touch.audience_target === 'project_contact') {
		throw createError({
			statusCode: 409,
			message: 'Single-recipient touches use base + first_name substitution, not per-recipient variants.',
		});
	}

	const organizationId: string = touch.organization;
	await requireOrgMembership(event, organizationId);

	const campaign = await directus
		.request(
			readItem('marketing_campaigns', touch.campaign, {
				fields: ['id', 'audience_snapshot'],
			}),
		)
		.catch(() => null) as any;

	if (!campaign) {
		throw createError({ statusCode: 404, message: 'Parent campaign not found' });
	}

	const contactIds: string[] = Array.isArray(campaign.audience_snapshot?.contact_ids)
		? campaign.audience_snapshot.contact_ids
		: [];

	if (contactIds.length === 0) {
		throw createError({
			statusCode: 409,
			message: 'Campaign audience snapshot has no contact_ids; nothing to personalize.',
		});
	}
	if (contactIds.length > MAX_PERSONALIZE_AUDIENCE) {
		throw createError({
			statusCode: 413,
			message: `Audience has ${contactIds.length} contacts (max ${MAX_PERSONALIZE_AUDIENCE} per personalization run).`,
		});
	}

	// Filter to contacts the send cron would actually email (has email,
	// not unsubscribed, not bounced). No point burning tokens on contacts
	// who'll be filtered out at send time. Cross-check membership in the
	// touch's org via the contacts_organizations M2M — defense in depth
	// against corrupted audience_snapshots leaking foreign contact ids.
	let eligibleContacts: { id: string }[] = [];
	try {
		eligibleContacts = await directus.request(
			readItems('contacts', {
				filter: {
					_and: [
						{ id: { _in: contactIds as any } },
						{ organizations: { organizations_id: { _eq: organizationId } } },
						{ email: { _nnull: true } },
						{ email_unsubscribed_at: { _null: true } },
						{ email_bounced: { _neq: true } },
					],
				},
				fields: ['id'],
				limit: MAX_PERSONALIZE_AUDIENCE,
			}),
		) as { id: string }[];
	} catch (err: any) {
		console.error('[personalize] eligible-contact query failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to resolve eligible contacts' });
	}

	if (eligibleContacts.length === 0) {
		throw createError({
			statusCode: 409,
			message: 'No eligible contacts in audience (all unsubscribed/bounced/missing email).',
		});
	}

	const eligibleIds = new Set(eligibleContacts.map((c) => c.id));

	// Load existing variants to honor idempotency.
	let existing: MarketingTouchVariant[] = [];
	try {
		existing = await directus.request(
			readItems('marketing_touch_variants', {
				filter: { touch: { _eq: touchId } },
				fields: ['id', 'contact', 'status'],
				limit: -1,
			}),
		) as MarketingTouchVariant[];
	} catch (err: any) {
		console.error('[personalize] existing-variant query failed:', err.message);
		throw createError({ statusCode: 500, message: 'Failed to load existing variants' });
	}

	const existingByContact = new Map<string, MarketingTouchVariant>();
	for (const v of existing) {
		existingByContact.set(String(v.contact), v);
	}

	// Decisions per contact:
	//   - completed → leave alone (idempotent)
	//   - pending/processing → leave alone (worker will get to it)
	//   - failed → delete the old row, re-enqueue as pending
	//   - missing → create new pending row
	const toDeleteIds: number[] = [];
	const toCreateContacts: string[] = [];
	let alreadyDone = 0;
	let alreadyQueued = 0;

	for (const contactId of eligibleIds) {
		const existing = existingByContact.get(contactId);
		if (!existing) {
			toCreateContacts.push(contactId);
		} else if (existing.status === 'completed') {
			alreadyDone++;
		} else if (existing.status === 'pending' || existing.status === 'processing') {
			alreadyQueued++;
		} else if (existing.status === 'failed') {
			toDeleteIds.push(existing.id);
			toCreateContacts.push(contactId);
		}
	}

	if (toDeleteIds.length > 0) {
		try {
			await directus.request(
				deleteItems('marketing_touch_variants', toDeleteIds as any),
			);
		} catch (err: any) {
			console.warn('[personalize] failed-variant cleanup failed:', err.message);
			// Non-fatal — proceed; worker will skip stale rows but they'll re-fail.
		}
	}

	// Bulk insert new pending rows.
	const created: MarketingTouchVariant[] = [];
	for (const contactId of toCreateContacts) {
		try {
			const row = await directus.request(
				createItem('marketing_touch_variants', {
					touch: touchId,
					contact: contactId,
					organization: organizationId,
					status: 'pending',
				}),
			) as MarketingTouchVariant;
			created.push(row);
		} catch (err: any) {
			// Likely a UNIQUE-constraint race (same touch+contact). Safe to skip.
			console.warn(`[personalize] variant create skipped for contact ${contactId}: ${err.message}`);
		}
	}

	// Update touch.personalization_state to reflect that work has been requested.
	const totalQueued = alreadyQueued + created.length;
	const newState = totalQueued > 0 ? 'in_progress' : alreadyDone > 0 ? 'completed' : 'requested';

	try {
		await directus.request(
			updateItem('marketing_touches', touchId, { personalization_state: newState }),
		);
	} catch (err: any) {
		console.warn('[personalize] touch state update failed:', err.message);
	}

	return {
		touch_id: touchId,
		personalization_state: newState,
		audience_size: contactIds.length,
		eligible_count: eligibleIds.size,
		queued: created.length,
		already_in_flight: alreadyQueued,
		already_completed: alreadyDone,
		failed_re_enqueued: toDeleteIds.length,
	};
});
