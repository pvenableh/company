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

import sgMail from '@sendgrid/mail';
import { createItem, readItem, readItems, updateItem } from '@directus/sdk';

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

async function loadEligibleContacts(directus: any, ids: string[]): Promise<ContactRow[]> {
	if (ids.length === 0) return [];
	const rows = await directus.request(
		readItems('contacts', {
			filter: {
				_and: [
					{ id: { _in: ids as any } },
					{ email: { _nnull: true } },
					{ email_unsubscribed_at: { _null: true } },
					{ email_bounced: { _neq: true } },
				],
			},
			fields: ['id', 'first_name', 'last_name', 'email', 'email_unsubscribed_at', 'email_bounced'],
			limit: 500,
		}),
	) as ContactRow[];
	return rows.filter((r) => !!r.email);
}

async function resolveAudience(args: {
	directus: any;
	touch: any;
	campaign: CampaignRow;
}): Promise<ContactRow[]> {
	const { directus, touch, campaign } = args;
	const filter: string = touch.audience_filter || 'all';
	const baseIds: string[] = (campaign.audience_snapshot?.contact_ids || []) as string[];

	if (filter === 'all' || filter.startsWith('cluster:')) {
		return loadEligibleContacts(directus, baseIds);
	}

	if (filter === 'unopened_previous' || filter === 'opened_previous') {
		// Find the previous email touch in this campaign by sequence_index.
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
		if (!prev) return loadEligibleContacts(directus, baseIds);

		// Look for opens via email_activity (if collection exists).
		let openedIds: Set<string> = new Set();
		try {
			const opens = await directus.request(
				readItems('email_activity', {
					filter: {
						_and: [
							{ event_type: { _eq: 'open' } },
							{ source_email_send: { _eq: prev.source_email_send } },
						],
					},
					fields: ['contact'],
					limit: 500,
				}),
			) as any[];
			openedIds = new Set(opens.map((o: any) => o.contact).filter(Boolean));
		} catch {
			// email_activity may not exist on this DB — fall back to "all".
			return loadEligibleContacts(directus, baseIds);
		}

		const targetIds = filter === 'opened_previous'
			? baseIds.filter((id) => openedIds.has(id))
			: baseIds.filter((id) => !openedIds.has(id));
		return loadEligibleContacts(directus, targetIds);
	}

	return loadEligibleContacts(directus, baseIds);
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

	if (dryRun) {
		console.info(
			`[marketing-send] DRY RUN — would send touch ${touch.id} to ${recipients.length} recipients ` +
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
	sgMail.setApiKey(apiKey as string);

	const fromEmail = (config as any).sendgridFromEmail || (config as any).FROM_EMAIL || 'hello@earnest.guru';
	const fromName = (config as any).sendgridFromName || 'Earnest';

	const subjectTemplate = touch.email_subject || '';
	const previewTemplate = touch.email_preview_text || '';
	const bodyTemplate = touch.email_body_markdown || '';

	let sentCount = 0;
	for (const r of recipients) {
		try {
			const subject = personalize(subjectTemplate, r);
			const preview = personalize(previewTemplate, r);
			const body = personalize(bodyTemplate, r);
			await sgMail.send({
				to: { email: r.email!, name: [r.first_name, r.last_name].filter(Boolean).join(' ') || undefined },
				from: { email: fromEmail, name: fromName },
				subject,
				text: body,
				html: `${preview ? `<div style="display:none;">${preview}</div>` : ''}<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#222;font-size:15px;line-height:1.55;">${mdToHtml(body)}</div>`,
				categories: ['marketing', `campaign-${campaign.id}`, `touch-${touch.id}`],
			});
			sentCount++;
		} catch (err: any) {
			console.error(`[marketing-send] send to ${r.email} failed:`, err.message);
		}
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
