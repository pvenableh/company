/**
 * Marketing-touch send utility.
 *
 * Resolves audience, fans the touch out to recipients, and updates the
 * marketing_touches + parent marketing_campaigns rows. Used by the
 * send-due-touches cron.
 *
 * Audience filter resolution:
 *   - 'all' → use full audience_snapshot.contact_ids (or campaign-level
 *     fallback)
 *   - 'unopened_previous' → exclude contacts who opened the previous
 *     email touch in this campaign (queries email_activity if present;
 *     falls back to 'all' on schema absence)
 *   - 'cluster:<label>' → use audience_snapshot.contact_ids (clustering
 *     was applied at generation time)
 *
 * Email send: SendGrid via @sendgrid/mail. Markdown body is rendered
 * to plain HTML (simple paragraph + list passes — no full MD compile).
 * Personalization: replaces {{first_name}} with the contact's first
 * name; falls back to "there" when missing.
 *
 * Social send: creates a row in social_posts in 'scheduled' status so
 * the existing social module's publisher picks it up. We don't post
 * directly to external networks here — that happens in the social
 * module's own publish path.
 *
 * Safety: every external action checks the global dryRun flag. When
 * dryRun is true, we log what would be sent but never call SendGrid
 * or write to social_posts.
 */

import { createItem, readItem, readItems, updateItem } from '@directus/sdk';
import type { MarketingTouchVariant } from '~~/shared/marketing-persistence';
import { renderOrgEmail } from './email-shell';
import { fetchOrgBrand, sendBrandedEmail } from './email-send';
import { buildUnsubscribeUrl } from './unsubscribe';

export interface SendTouchArgs {
	touchId: number;
	dryRun: boolean;
}

export interface SendTouchResult {
	touchId: number;
	kind: 'email' | 'social';
	status: 'sent' | 'skipped' | 'failed' | 'dry_run';
	recipients: number;
	reason?: string;
}

interface CampaignRow {
	id: number;
	organization: string;
	status: string;
	audience_snapshot: { contact_ids?: string[]; sample_names?: string[] } | null;
}

interface ContactRow {
	id: string;
	first_name: string | null;
	last_name: string | null;
	email: string | null;
	email_unsubscribed_at: string | null;
	email_bounced: boolean | null;
	unsubscribe_token: string | null;
}

function mdToHtml(md: string): string {
	if (!md) return '';
	const escaped = md
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
	const lines = escaped.split('\n');
	const out: string[] = [];
	let inList = false;
	let para: string[] = [];
	const flushPara = () => {
		if (para.length) {
			out.push(`<p>${para.join(' ')}</p>`);
			para = [];
		}
	};
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) {
			if (inList) { out.push('</ul>'); inList = false; }
			flushPara();
			continue;
		}
		if (line.startsWith('- ') || line.startsWith('* ')) {
			flushPara();
			if (!inList) { out.push('<ul>'); inList = true; }
			out.push(`<li>${line.slice(2)}</li>`);
			continue;
		}
		if (inList) { out.push('</ul>'); inList = false; }
		para.push(line);
	}
	if (inList) out.push('</ul>');
	flushPara();
	return out.join('\n');
}

function personalize(template: string, contact: ContactRow): string {
	const first = (contact.first_name || '').trim() || 'there';
	return template.replace(/\{\{first_name\}\}/g, first);
}

async function loadEligibleContacts(directus: any, ids: string[], organizationId: string): Promise<ContactRow[]> {
	if (ids.length === 0) return [];
	// Defense in depth: the audience_snapshot is supposed to contain only
	// contacts from the campaign's org, but a corrupted snapshot or a stale
	// resolver run could include foreign-org ids. Cross-check via the M2M
	// junction so the send cron physically can't email another tenant.
	const rows = await directus.request(
		readItems('contacts', {
			filter: {
				_and: [
					{ id: { _in: ids as any } },
					{ organizations: { organizations_id: { _eq: organizationId } } },
					{ email: { _nnull: true } },
					{ email_unsubscribed_at: { _null: true } },
					{ email_bounced: { _neq: true } },
				],
			},
			fields: ['id', 'first_name', 'last_name', 'email', 'email_unsubscribed_at', 'email_bounced', 'unsubscribe_token'],
			limit: 500,
		}),
	) as ContactRow[];
	return rows.filter((r) => !!r.email);
}

/**
 * Resolve recipients from a mailing_list_contacts join. Two queries: get
 * the contact-id list off the junction (where subscribed=true), then
 * reuse `loadEligibleContacts` which already enforces the org-membership
 * + email-subscribed + bounced + unsubscribed filters.
 *
 * Why two queries instead of one nested: the server token's policy on
 * `mailing_list_contacts` doesn't grant the deep field walk through
 * `contact_id.organizations.organizations_id` etc. Splitting the read
 * keeps each query inside its collection's permitted field surface.
 */
async function loadMailingListContacts(
	directus: any,
	listId: number,
	organizationId: string,
): Promise<ContactRow[]> {
	const members = (await directus.request(
		readItems('mailing_list_contacts', {
			filter: {
				_and: [
					{ list_id: { _eq: listId } },
					{ subscribed: { _eq: true } },
				],
			},
			fields: ['contact_id'],
			limit: 500,
		}),
	)) as Array<{ contact_id: string | { id?: string } | null }>;

	const ids = members
		.map((m) => {
			const c = m.contact_id;
			if (!c) return null;
			return typeof c === 'object' ? (c.id ?? null) : c;
		})
		.filter((id): id is string => !!id);

	return loadEligibleContacts(directus, ids, organizationId);
}

/**
 * Resolve recipients for a single audience_segment target. Pulled out of
 * `resolveAudience` so the junction-row loop can dispatch per-target
 * without duplicating the unopened/opened-previous lookup.
 */
async function resolveSegmentRecipients(args: {
	directus: any;
	touch: any;
	campaign: CampaignRow;
	filter: string;
}): Promise<ContactRow[]> {
	const { directus, touch, campaign, filter } = args;
	const baseIds: string[] = (campaign.audience_snapshot?.contact_ids || []) as string[];

	if (filter === 'all' || filter.startsWith('cluster:')) {
		return loadEligibleContacts(directus, baseIds, campaign.organization);
	}

	if (filter === 'unopened_previous' || filter === 'opened_previous') {
		const previous = await directus.request(
			readItems('marketing_touches', {
				filter: {
					_and: [
						{ campaign: { _eq: campaign.id } },
						{ kind: { _eq: 'email' } },
						{ sequence_index: { _lt: touch.sequence_index } },
					],
				},
				fields: ['id', 'sequence_index', 'source_email_send'],
				sort: ['-sequence_index'],
				limit: 1,
			}),
		) as any[];
		const prev = previous[0];
		if (!prev) return loadEligibleContacts(directus, baseIds, campaign.organization);

		let openedIds: Set<string> = new Set();
		try {
			const opens = await directus.request(
				readItems('email_events', {
					filter: {
						_and: [
							{ event: { _eq: 'open' } },
							{ email_id: { _eq: prev.source_email_send } },
						],
					},
					fields: ['contact'],
					limit: 500,
				}),
			) as any[];
			openedIds = new Set(opens.map((o: any) => o.contact).filter(Boolean));
		} catch {
			return loadEligibleContacts(directus, baseIds, campaign.organization);
		}

		const targetIds = filter === 'opened_previous'
			? baseIds.filter((id) => openedIds.has(id))
			: baseIds.filter((id) => !openedIds.has(id));
		return loadEligibleContacts(directus, targetIds, campaign.organization);
	}

	return loadEligibleContacts(directus, baseIds, campaign.organization);
}

/**
 * Resolve a single junction-row target → ContactRow[].
 *
 * Dispatches on `target_kind`. The FK shape on the row is the
 * Directus-default for non-expanded m2o (bare id), since the junction
 * read doesn't deep-walk per the policy in
 * [[feedback_directus_o2m_alias_gotcha]] / the `loadMailingListContacts`
 * comment above.
 */
async function resolveTargetRow(args: {
	directus: any;
	row: {
		target_kind: 'mailing_list' | 'audience_segment';
		mailing_list: number | { id?: number } | null;
		audience_filter: string | null;
	};
	touch: any;
	campaign: CampaignRow;
}): Promise<ContactRow[]> {
	const { directus, row, touch, campaign } = args;
	if (row.target_kind === 'mailing_list') {
		const listId = typeof row.mailing_list === 'object'
			? Number((row.mailing_list as { id?: number } | null)?.id)
			: Number(row.mailing_list);
		if (!Number.isFinite(listId)) return [];
		return loadMailingListContacts(directus, listId, campaign.organization);
	}
	const filter = row.audience_filter || 'all';
	return resolveSegmentRecipients({ directus, touch, campaign, filter });
}

async function resolveAudience(args: {
	directus: any;
	touch: any;
	campaign: CampaignRow;
}): Promise<ContactRow[]> {
	const { directus, touch, campaign } = args;

	// P4 Item A.1: try the junction first. When rows exist, union all
	// targets and dedupe by contact id. Junction rows always win over the
	// back-compat single-FK columns — the POST/PATCH handlers keep both
	// in sync (mirror the first target), so reading the junction is
	// strictly more general.
	let junctionRows: Array<{
		id: number;
		target_kind: 'mailing_list' | 'audience_segment';
		mailing_list: number | { id?: number } | null;
		audience_filter: string | null;
		sort: number | null;
	}> = [];
	try {
		junctionRows = (await directus.request(
			readItems('marketing_touch_targets', {
				filter: { touch: { _eq: Number(touch.id) } },
				fields: ['id', 'target_kind', 'mailing_list', 'audience_filter', 'sort'],
				sort: ['sort'],
				limit: 50,
			}),
		)) as typeof junctionRows;
	} catch (err: any) {
		console.warn('[marketing-send] junction read failed; falling back to legacy single-target:', err.message);
	}

	if (junctionRows.length > 0) {
		const buckets = await Promise.all(
			junctionRows.map((row) => resolveTargetRow({ directus, row, touch, campaign })),
		);
		// Dedupe by contact id — same contact across multiple lists/segments
		// is emailed exactly once per touch.
		const merged = new Map<string, ContactRow>();
		for (const bucket of buckets) {
			for (const r of bucket) {
				if (!merged.has(r.id)) merged.set(r.id, r);
			}
		}
		return Array.from(merged.values());
	}

	// Legacy fallback for pre-junction rows: mailing-list FK takes priority,
	// then audience_filter. Same behavior as P4.2 — kept until every touch
	// has at least one junction row (back-compat columns get cleared in a
	// later cleanup phase).
	if (touch.mailing_list != null) {
		const listId = typeof touch.mailing_list === 'object'
			? Number((touch.mailing_list as { id?: number })?.id)
			: Number(touch.mailing_list);
		if (Number.isFinite(listId)) {
			return loadMailingListContacts(directus, listId, campaign.organization);
		}
	}

	const filter: string = touch.audience_filter || 'all';
	return resolveSegmentRecipients({ directus, touch, campaign, filter });
}

async function loadVariantsByContact(
	directus: any,
	touchId: number,
	contactIds: string[],
): Promise<Map<string, MarketingTouchVariant>> {
	if (contactIds.length === 0) return new Map();
	try {
		const rows = await directus.request(
			readItems('marketing_touch_variants', {
				filter: {
					_and: [
						{ touch: { _eq: touchId } },
						{ contact: { _in: contactIds as any } },
						{ status: { _eq: 'completed' } },
					],
				},
				fields: ['id', 'contact', 'email_subject', 'email_preview_text', 'email_body_markdown'],
				limit: -1,
			}),
		) as MarketingTouchVariant[];
		return new Map(rows.map((r) => [String(r.contact), r]));
	} catch (err: any) {
		console.warn('[marketing-send] variant lookup failed (falling back to base):', err.message);
		return new Map();
	}
}

async function sendEmailTouch(args: {
	directus: any;
	touch: any;
	campaign: CampaignRow;
	dryRun: boolean;
}): Promise<SendTouchResult> {
	const { directus, touch, campaign, dryRun } = args;

	const recipients = await resolveAudience({ directus, touch, campaign });
	if (recipients.length === 0) {
		return {
			touchId: touch.id,
			kind: 'email',
			status: 'skipped',
			recipients: 0,
			reason: 'No eligible recipients after audience resolution.',
		};
	}

	// Per-recipient variants override the base content. Variants store the
	// already-personalized strings — no {{first_name}} substitution needed
	// when reading them.
	const variants = await loadVariantsByContact(
		directus,
		touch.id,
		recipients.map((r) => r.id),
	);
	const variantCount = variants.size;

	if (dryRun) {
		console.info(
			`[marketing-send] DRY RUN — would send touch ${touch.id} to ${recipients.length} recipients ` +
			`(${variantCount} via personalized variant, ${recipients.length - variantCount} via base) ` +
			`(campaign ${campaign.id}, subject: "${touch.email_subject}")`,
		);
		return { touchId: touch.id, kind: 'email', status: 'dry_run', recipients: recipients.length };
	}

	const config = useRuntimeConfig();
	const apiKey = (config as any).sendgridApiKey || (config as any).SENDGRID_API_KEY;
	if (!apiKey) {
		return {
			touchId: touch.id,
			kind: 'email',
			status: 'failed',
			recipients: recipients.length,
			reason: 'SendGrid API key not configured',
		};
	}

	// Resolve org brand once (logo, brand_color, whitelabel, mailing_address).
	// All recipients in this touch share the same org.
	const org = await fetchOrgBrand(campaign.organization);
	const siteUrl = (config.public as any)?.siteUrl || 'https://app.earnest.guru';
	const physicalAddress = org?.mailing_address || null;

	const subjectTemplate = touch.email_subject || '';
	const previewTemplate = touch.email_preview_text || '';
	const bodyTemplate = touch.email_body_markdown || '';

	let sentCount = 0;
	for (const r of recipients) {
		const variant = variants.get(r.id);
		// Variant strings are already personalized — no {{first_name}} swap.
		// Base strings still go through personalize() for the legacy mail-merge.
		const subject = variant?.email_subject ?? personalize(subjectTemplate, r);
		const preview = variant?.email_preview_text ?? personalize(previewTemplate, r);
		const body = variant?.email_body_markdown ?? personalize(bodyTemplate, r);

		const unsubscribeUrl = r.unsubscribe_token
			? buildUnsubscribeUrl(r.unsubscribe_token, siteUrl)
			: `${siteUrl}/unsubscribe`;

		const { html, text } = renderOrgEmail({
			org,
			subject,
			preheader: preview || null,
			heading: null,
			bodyHtml: mdToHtml(body),
			unsubscribeUrl,
			physicalAddress,
		});

		const result = await sendBrandedEmail({
			to: r.email!,
			subject,
			html,
			text: text || body,
			org,
			categories: ['marketing', `campaign-${campaign.id}`, `touch-${touch.id}`],
			emailName: `campaign-${campaign.id}-touch-${touch.id}`,
			sendCollection: 'marketing_campaign_touches',
			sendId: touch.id,
		});
		if (result.sent) sentCount++;
		else console.error(`[marketing-send] send to ${r.email} failed:`, result.reason);
	}

	return {
		touchId: touch.id,
		kind: 'email',
		status: sentCount > 0 ? 'sent' : 'failed',
		recipients: sentCount,
		reason: sentCount === 0 ? 'All sends failed' : undefined,
	};
}

async function sendSocialTouch(args: {
	directus: any;
	touch: any;
	campaign: CampaignRow;
	dryRun: boolean;
}): Promise<SendTouchResult> {
	const { directus, touch, campaign, dryRun } = args;

	if (!touch.social_channel || !touch.social_caption) {
		return { touchId: touch.id, kind: 'social', status: 'skipped', recipients: 0, reason: 'Missing channel or caption' };
	}

	if (dryRun) {
		console.info(
			`[marketing-send] DRY RUN — would create ${touch.social_channel} post (campaign ${campaign.id}): ` +
			`"${touch.social_caption.slice(0, 80)}..."`,
		);
		return { touchId: touch.id, kind: 'social', status: 'dry_run', recipients: 1 };
	}

	try {
		const created = await directus.request(
			createItem('social_posts', {
				organization: campaign.organization,
				platform: touch.social_channel,
				content: touch.social_caption,
				scheduled_at: touch.scheduled_for,
				status: 'scheduled',
				ai_generated: true,
			}),
		) as any;

		await directus.request(
			updateItem('marketing_touches', touch.id, {
				source_social_post: created.id,
			}),
		);

		return { touchId: touch.id, kind: 'social', status: 'sent', recipients: 1 };
	} catch (err: any) {
		console.error('[marketing-send] social create failed:', err.message);
		return {
			touchId: touch.id,
			kind: 'social',
			status: 'failed',
			recipients: 0,
			reason: err.message,
		};
	}
}

export async function fireDueTouch(args: SendTouchArgs): Promise<SendTouchResult> {
	const directus = getTypedDirectus();

	const touch = await directus
		.request(
			readItem('marketing_touches', args.touchId, {
				fields: [
					'id',
					'campaign',
					'sequence_index',
					'kind',
					'audience_filter',
					'audience_target',
					'mailing_list',
					'scheduled_for',
					'status',
					'email_subject',
					'email_preview_text',
					'email_body_markdown',
					'social_channel',
					'social_caption',
					'social_image_brief',
				],
			}),
		)
		.catch(() => null) as any;

	if (!touch) {
		return { touchId: args.touchId, kind: 'email', status: 'failed', recipients: 0, reason: 'Touch not found' };
	}
	if (touch.status !== 'scheduled') {
		return {
			touchId: args.touchId,
			kind: touch.kind,
			status: 'skipped',
			recipients: 0,
			reason: `Touch is ${touch.status}`,
		};
	}

	const campaign = await directus
		.request(
			readItem('marketing_campaigns', touch.campaign, {
				fields: ['id', 'organization', 'status', 'audience_snapshot'],
			}),
		)
		.catch(() => null) as CampaignRow | null;

	if (!campaign) {
		return { touchId: args.touchId, kind: touch.kind, status: 'failed', recipients: 0, reason: 'Parent campaign missing' };
	}

	const result = touch.kind === 'email'
		? await sendEmailTouch({ directus, touch, campaign, dryRun: args.dryRun })
		: await sendSocialTouch({ directus, touch, campaign, dryRun: args.dryRun });

	if (!args.dryRun) {
		try {
			await directus.request(
				updateItem('marketing_touches', touch.id, {
					status: result.status === 'sent' ? 'sent' : result.status === 'failed' ? 'failed' : touch.status,
					sent_at: result.status === 'sent' ? new Date().toISOString() : null,
				}),
			);
		} catch (err: any) {
			console.warn('[marketing-send] touch status update failed:', err.message);
		}
		// Update parent campaign status: partial_sent on first, completed on last.
		await advanceCampaignStatus(directus, campaign.id);
	}

	return result;
}

async function advanceCampaignStatus(directus: any, campaignId: number): Promise<void> {
	try {
		const touches = await directus.request(
			readItems('marketing_touches', {
				filter: { campaign: { _eq: campaignId } },
				fields: ['id', 'status'],
				limit: 50,
			}),
		) as any[];
		if (!touches.length) return;
		const total = touches.length;
		const sent = touches.filter((t) => t.status === 'sent').length;
		const allFinal = touches.every((t) => ['sent', 'failed', 'cancelled'].includes(t.status));
		const next = allFinal ? 'completed' : sent > 0 ? 'partial_sent' : null;
		if (next) {
			await directus.request(updateItem('marketing_campaigns', campaignId, { status: next }));
		}
	} catch (err: any) {
		console.warn('[marketing-send] campaign status advance failed:', err.message);
	}
}
