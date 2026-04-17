/**
 * Send a newsletter to mailing lists, individual recipients, or both.
 * Uses the pre-compiled MJML from email_templates.mjml_source.
 * Supports list-based targeting with deduplication.
 */
import sgMail from '@sendgrid/mail';
import { compileMjml, compileSubject } from '~~/server/utils/mjml-compiler';
import { buildContactVariableMap } from '~~/server/utils/contact-variables';
import { readItems, readItem, createItem, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const {
    email_id,
    template_id,
    name,
    subject: emailSubject,
    target_lists,
    target_segments,
    recipient_ids,
    cc_list,
    bcc_list,
    custom_variables,
    organization_id,
  } = await readBody(event);

  if (!template_id) {
    throw createError({ statusCode: 400, message: 'template_id is required' });
  }

  if (!target_lists?.length && !recipient_ids?.length && !target_segments?.length) {
    throw createError({
      statusCode: 400,
      message: 'target_lists, target_segments, or recipient_ids is required',
    });
  }

  if (target_segments?.length && !organization_id) {
    throw createError({
      statusCode: 400,
      message: 'organization_id is required when using target_segments',
    });
  }

  const apiKey = config.sendgridApiKey || config.SENDGRID_API_KEY;
  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'SendGrid API key not configured' });
  }

  sgMail.setApiKey(apiKey as string);
  const directus = getServerDirectus();

  // Fetch the template
  const template = (await directus.request(readItem('email_templates', template_id))) as any;
  if (!template?.mjml_source) {
    throw createError({ statusCode: 400, message: 'Template has no compiled MJML' });
  }

  // ── Resolve recipients from mailing lists (deduplicated) ──────────────
  const seen = new Set<string>();
  const contacts: any[] = [];

  if (target_lists?.length) {
    const allMembers = await Promise.all(
      target_lists.map((listId: number) =>
        directus.request(
          readItems('mailing_list_contacts', {
            fields: ['contact_id.*', 'custom_fields'],
            filter: {
              _and: [
                { list_id: { _eq: listId } },
                { subscribed: { _eq: true } },
                { 'contact_id.email_subscribed': { _eq: true } },
                { 'contact_id.email_bounced': { _eq: false } },
                { 'contact_id.status': { _eq: 'published' } },
              ],
            },
            limit: -1,
          })
        )
      )
    );

    for (const members of allMembers) {
      for (const member of members as any[]) {
        const contact = member.contact_id;
        if (contact?.email && !seen.has(contact.email)) {
          seen.add(contact.email);
          // Parse JSON string custom_fields before merging
          const contactCF = typeof contact.custom_fields === 'string'
            ? (() => { try { return JSON.parse(contact.custom_fields); } catch { return {}; } })()
            : (contact.custom_fields || {});
          const memberCF = typeof member.custom_fields === 'string'
            ? (() => { try { return JSON.parse(member.custom_fields); } catch { return {}; } })()
            : (member.custom_fields || {});
          contacts.push({
            ...contact,
            custom_fields: { ...contactCF, ...memberCF },
          });
        }
      }
    }
  }

  // ── Resolve CRM segments → contact IDs ────────────────────────────
  if (target_segments?.length && organization_id) {
    const segmentContactIds = await resolveSegments(directus, organization_id, target_segments);
    if (segmentContactIds.length) {
      const segmentContacts = (await directus.request(
        readItems('contacts', {
          filter: {
            _and: [
              { id: { _in: segmentContactIds } },
              { email_subscribed: { _eq: true } },
              { email_bounced: { _eq: false } },
              { status: { _eq: 'published' } },
            ],
          },
          limit: -1,
        })
      )) as any[];

      for (const contact of segmentContacts) {
        if (contact?.email && !seen.has(contact.email)) {
          seen.add(contact.email);
          contacts.push(contact);
        }
      }
    }
  }

  // Also include individual recipients
  if (recipient_ids?.length) {
    const fetched = (await directus.request(
      readItems('contacts', {
        filter: {
          _and: [
            { id: { _in: recipient_ids } },
            { email_subscribed: { _eq: true } },
            { email_bounced: { _eq: false } },
            { status: { _eq: 'published' } },
          ],
        },
        limit: -1,
      })
    )) as any[];

    for (const contact of fetched) {
      if (contact?.email && !seen.has(contact.email)) {
        seen.add(contact.email);
        contacts.push(contact);
      }
    }
  }

  if (contacts.length === 0) {
    return { success: false, error: 'No eligible recipients found', sent: 0 };
  }

  const fromEmail = config.sendgridFromEmail || config.FROM_EMAIL || 'hello@earnest.guru';
  const fromName = config.sendgridFromName || 'Earnest';
  const appName = (config.public?.companyName as string) || fromName;
  const siteUrl = (config.public?.siteUrl as string) || 'https://app.earnest.guru';

  // ── Pre-create / update email record as "sending" to get an ID ──────
  let recordedEmailId = email_id;
  try {
    if (email_id) {
      await directus.request(
        updateItem('emails', email_id, { status: 'sending' })
      );
    } else {
      const created = await directus.request(
        createItem('emails', {
          status: 'sending',
          name: name || template.name,
          subject: emailSubject || template.subject_template || template.name,
          template_id: template_id,
          target_lists: target_lists ? JSON.stringify(target_lists) : null,
          cc_list: cc_list ? JSON.stringify(cc_list) : null,
          bcc_list: bcc_list ? JSON.stringify(bcc_list) : null,
          custom_variables: custom_variables ? JSON.stringify(custom_variables) : null,
        })
      );
      recordedEmailId = (created as any)?.id;
    }
  } catch (recordErr: any) {
    console.error('[newsletter-send] Failed to pre-create email record:', recordErr.message);
  }

  // Build the web view URL (available for the {{web_view_url}} merge tag)
  const webViewUrl = recordedEmailId
    ? `${siteUrl}/email/view/${recordedEmailId}`
    : '';

  const errors: string[] = [];
  let sentCount = 0;

  // Send one email per recipient for personalization
  for (const contact of contacts) {
    const variables = buildContactVariableMap(contact, {
      appName,
      appUrl: siteUrl,
      year: new Date().getFullYear(),
      emailCustomVars: {
        ...(custom_variables || {}),
        web_view_url: webViewUrl,
      },
    });

    const { html, errors: compileErrors } = compileMjml(template.mjml_source, variables);
    if (!html) {
      errors.push(`Failed to compile for ${contact.email}: ${compileErrors.join(', ')}`);
      continue;
    }

    const subject = template.subject_template
      ? compileSubject(template.subject_template, variables)
      : template.name;

    const msg: any = {
      to: contact.email,
      from: { email: fromEmail, name: fromName },
      subject,
      html,
    };

    if (cc_list?.length) {
      msg.cc = cc_list.map((email: string) => ({ email }));
    }
    if (bcc_list?.length) {
      msg.bcc = bcc_list.map((email: string) => ({ email }));
    }

    try {
      await sgMail.send(msg);
      sentCount++;
    } catch (err: any) {
      errors.push(`Failed to send to ${contact.email}: ${err.message}`);
    }
  }

  // ── Build a generic preview HTML for web view (no personalized data) ──
  let previewHtml: string | null = null;
  try {
    const previewVars: Record<string, any> = {
      first_name: '',
      last_name: '',
      email: '',
      full_name: '',
      formal_name: '',
      year: new Date().getFullYear(),
      app_name: appName,
      app_url: siteUrl,
      unsubscribe_url: `${siteUrl}/unsubscribe`,
      web_view_url: webViewUrl,
      ...(custom_variables || {}),
    };
    const previewResult = compileMjml(template.mjml_source, previewVars);
    if (previewResult.html) {
      previewHtml = previewResult.html;
    }
  } catch {
    // Non-critical — web view just won't be available
  }

  // ── Finalize the email record ─────────────────────────────────────────
  try {
    if (recordedEmailId) {
      await directus.request(
        updateItem('emails', recordedEmailId, {
          status: errors.length === 0 ? 'sent' : 'failed',
          sent_at: new Date().toISOString(),
          total_recipients: contacts.length,
          total_sent: sentCount,
          total_failed: contacts.length - sentCount,
          send_errors: errors.length > 0 ? JSON.stringify(errors) : null,
          preview_html: previewHtml,
        })
      );
    }
  } catch (recordErr: any) {
    console.error('[newsletter-send] Failed to update email record:', recordErr.message);
  }

  return {
    success: errors.length === 0,
    sent: sentCount,
    total: contacts.length,
    email_id: recordedEmailId,
    web_view_url: recordedEmailId ? `/email/view/${recordedEmailId}` : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };
});

/**
 * Resolve CRM segment descriptors into a list of contact IDs.
 *
 * Supported segment types:
 *   { type: 'lead_stage', stage: 'negotiating' }        — contacts on leads at stage X
 *   { type: 'lead_any_open' }                             — contacts on any non-won/non-lost lead
 *   { type: 'client_active' }                             — contacts with a client FK where client is active
 *   { type: 'contact_category', category: 'architect' }   — contacts by category
 */
async function resolveSegments(
  directus: ReturnType<typeof getServerDirectus>,
  organizationId: string,
  segments: Array<Record<string, any>>,
): Promise<string[]> {
  const ids = new Set<string>();

  for (const seg of segments) {
    try {
      if (seg?.type === 'lead_stage' || seg?.type === 'lead_any_open') {
        const filter: any = {
          _and: [
            { organization: { _eq: organizationId } },
            { related_contact: { _nnull: true } },
            { status: { _eq: 'published' } },
          ],
        };
        if (seg.type === 'lead_stage' && seg.stage) {
          filter._and.push({ stage: { _eq: seg.stage } });
        } else {
          filter._and.push({ stage: { _nin: ['won', 'lost'] } });
        }
        const rows = (await directus.request(
          readItems('leads', { filter, fields: ['related_contact'], limit: -1 }),
        )) as any[];
        for (const r of rows) {
          const cid = typeof r.related_contact === 'string' ? r.related_contact : r.related_contact?.id;
          if (cid) ids.add(cid);
        }
      } else if (seg?.type === 'client_active') {
        const rows = (await directus.request(
          readItems('contacts', {
            filter: {
              _and: [
                { organizations: { organizations_id: { _eq: organizationId } } },
                { client: { _nnull: true } },
                { 'client.status': { _eq: 'active' } },
              ],
            },
            fields: ['id'],
            limit: -1,
          }),
        )) as any[];
        for (const r of rows) if (r.id) ids.add(r.id);
      } else if (seg?.type === 'contact_category' && seg.category) {
        const rows = (await directus.request(
          readItems('contacts', {
            filter: {
              _and: [
                { organizations: { organizations_id: { _eq: organizationId } } },
                { category: { _eq: seg.category } },
              ],
            },
            fields: ['id'],
            limit: -1,
          }),
        )) as any[];
        for (const r of rows) if (r.id) ids.add(r.id);
      }
    } catch (err: any) {
      console.warn(`[newsletter-send] Segment ${seg?.type} failed:`, err?.message);
    }
  }

  return Array.from(ids);
}
