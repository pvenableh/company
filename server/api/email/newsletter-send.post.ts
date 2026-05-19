/**
 * Send a newsletter to mailing lists, individual recipients, or both.
 * Uses the pre-compiled MJML from email_templates.mjml_source.
 * Supports list-based targeting with deduplication.
 */
import sgMail from '@sendgrid/mail';
import { compileMjml, compileSubject } from '~~/server/utils/mjml-compiler';
import { buildContactVariableMap } from '~~/server/utils/contact-variables';
import { injectMarketingFooter } from '~~/server/utils/email-shell';
import { fetchOrgBrand } from '~~/server/utils/email-send';
import { buildUnsubscribeUrl } from '~~/server/utils/unsubscribe';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';
import { readItems, readItem, createItem, updateItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);
  const dryRun = query.dry_run === '1' || query.dry_run === 'true';

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

  if (!template_id && !dryRun) {
    throw createError({ statusCode: 400, message: 'template_id is required' });
  }

  if (!target_lists?.length && !recipient_ids?.length && !target_segments?.length) {
    throw createError({
      statusCode: 400,
      message: 'target_lists, target_segments, or recipient_ids is required',
    });
  }

  // Gate the whole route on org membership. The route uses the service-account
  // directus token below — without this check, any authed user (or unauthed
  // caller in some configs) could send under another tenant's brand and burn
  // its SendGrid quota. The contacts-leak audit already added M2M filters on
  // every recipient lookup, but the auth gate has to live here.
  if (!organization_id) {
    throw createError({ statusCode: 400, message: 'organization_id is required' });
  }
  await requireOrgMembership(event, organization_id);

  const apiKey = config.sendgridApiKey || config.SENDGRID_API_KEY;
  if (!apiKey && !dryRun) {
    throw createError({ statusCode: 500, message: 'SendGrid API key not configured' });
  }

  if (apiKey) sgMail.setApiKey(apiKey as string);
  const directus = getServerDirectus();

  // Fetch the template (skipped on dry run — we only need recipient resolution).
  // Ownership check: the template must belong to organization_id OR be a
  // platform starter (is_starter=true). Otherwise a caller could pass another
  // tenant's template_id and send under their content under their own org's brand.
  const template = template_id
    ? ((await directus.request(
        readItem('email_templates', template_id, {
          fields: ['id', 'name', 'subject_template', 'mjml_source', 'organization', 'is_starter'],
        }),
      ).catch(() => null)) as any)
    : null;
  if (template_id && !template) {
    throw createError({ statusCode: 404, message: 'Template not found' });
  }
  if (template && !template.is_starter) {
    const templateOrg = typeof template.organization === 'string'
      ? template.organization
      : template.organization?.id;
    if (templateOrg !== organization_id) {
      throw createError({ statusCode: 403, message: 'Template does not belong to this organization' });
    }
  }
  if (!dryRun && !template?.mjml_source) {
    throw createError({ statusCode: 400, message: 'Template has no compiled MJML' });
  }

  // Same ownership check on mailing lists — without it a caller could pass a
  // foreign-org list id and the M2M contact filter below would still narrow
  // to their own subscribers (correctly), but the list lookup itself would
  // succeed and that's a confusing error surface.
  if (target_lists?.length) {
    const listRows = (await directus.request(
      readItems('mailing_lists', {
        filter: { id: { _in: target_lists } },
        fields: ['id', 'organization'],
        limit: -1,
      }),
    )) as any[];
    if (listRows.length !== target_lists.length) {
      throw createError({ statusCode: 404, message: 'One or more mailing lists not found' });
    }
    for (const row of listRows) {
      const listOrg = typeof row.organization === 'string'
        ? row.organization
        : row.organization?.id;
      if (listOrg !== organization_id) {
        throw createError({
          statusCode: 403,
          message: `Mailing list ${row.id} does not belong to this organization`,
        });
      }
    }
  }

  // ── Resolve recipients from mailing lists (deduplicated) ──────────────
  const seen = new Set<string>();
  const contacts: any[] = [];

  if (target_lists?.length) {
    // Org-scope each list lookup so a caller can't pass a foreign-org listId
    // and pull that tenant's subscribers. Contacts join orgs via the M2M
    // junction — filter through `contact_id.organizations.organizations_id`.
    const listOrgFilter = organization_id
      ? [{ 'contact_id.organizations.organizations_id': { _eq: organization_id } }]
      : [];
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
                ...listOrgFilter,
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
    // Constrain to contacts that belong to the sending org. Without this,
    // a caller could pass any contact ids and the service-account token
    // would happily return them, leaking subscribers across tenants.
    const recipientOrgFilter = organization_id
      ? [{ organizations: { organizations_id: { _eq: organization_id } } }]
      : [];
    const fetched = (await directus.request(
      readItems('contacts', {
        filter: {
          _and: [
            { id: { _in: recipient_ids } },
            { email_subscribed: { _eq: true } },
            { email_bounced: { _eq: false } },
            { status: { _eq: 'published' } },
            ...recipientOrgFilter,
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

  if (dryRun) {
    return {
      success: true,
      dry_run: true,
      total: contacts.length,
      sample_emails: contacts.slice(0, 5).map((c) => c.email),
    };
  }

  if (contacts.length === 0) {
    return { success: false, error: 'No eligible recipients found', sent: 0 };
  }

  const fromEmail = config.sendgridFromEmail || config.FROM_EMAIL || 'hello@earnest.guru';
  const globalFromName = config.sendgridFromName || 'Earnest';
  const globalReplyTo = (config as any).sendgridReplyToEmail || (config as any).SENDGRID_REPLY_TO_EMAIL;
  const appName = (config.public?.companyName as string) || globalFromName;
  const siteUrl = (config.public?.siteUrl as string) || 'https://app.earnest.guru';

  // Resolve org branding once for the whole send (one campaign = one org).
  // Drives fromName, reply-to, logo/brand_color, whitelabel, and the
  // CAN-SPAM footer (unsubscribe + physical address).
  const org = organization_id ? await fetchOrgBrand(organization_id) : null;
  const fromName = (org?.name && String(org.name).trim()) || globalFromName;
  const replyTo = (org as any)?.email_reply_to || globalReplyTo || null;
  const physicalAddress = org?.mailing_address || null;

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

    const { html: compiledHtml, errors: compileErrors } = compileMjml(template.mjml_source, variables);
    if (!compiledHtml) {
      errors.push(`Failed to compile for ${contact.email}: ${compileErrors.join(', ')}`);
      continue;
    }

    const subject = template.subject_template
      ? compileSubject(template.subject_template, variables)
      : template.name;

    const unsubscribeUrl = contact.unsubscribe_token
      ? buildUnsubscribeUrl(contact.unsubscribe_token, siteUrl)
      : `${siteUrl}/unsubscribe`;

    // Inject the CAN-SPAM footer directly into the MJML output instead of
    // wrapping the body inside renderOrgEmail's transactional shell. The
    // old path stripped MJML's <head> styles (losing responsive media
    // queries) and nested its 600px content table inside a 560px shell —
    // emails delivered but rendered broken, especially on mobile. The
    // MJML doc already carries the org's chrome via its header/footer
    // partials; we only need to append the compliance footer.
    const finalHtml = injectMarketingFooter(compiledHtml, {
      org,
      unsubscribeUrl,
      physicalAddress,
    });

    const msg: any = {
      to: contact.email,
      from: { email: fromEmail, name: fromName },
      subject,
      html: finalHtml,
      categories: ['marketing', `newsletter-template-${template_id}`, ...(recordedEmailId ? [`email-${recordedEmailId}`] : [])],
    };

    if (replyTo) msg.replyTo = replyTo;
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

  // Bump `last_contacted_at` for every successful recipient. We pass the full
  // contact list (including the failures) — touchContacts is a best-effort
  // analytics update; it filters internally and never throws.
  if (sentCount > 0) {
    const successEmails = contacts
      .map((c) => c.email)
      .filter((e): e is string => !!e);
    // Scope the touch update to the sending org — without it, contacts
    // sharing the same email across orgs all get bumped.
    await touchContacts(successEmails, 'email', organization_id || null);
  }

  // ── Build a generic preview HTML for web view (no personalized data) ──
  // Mirror the live-send path: MJML output + injectMarketingFooter, never
  // double-wrapped. Keeps the web view visually identical to what landed
  // in recipient inboxes.
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
      previewHtml = injectMarketingFooter(previewResult.html, {
        org,
        unsubscribeUrl: `${siteUrl}/unsubscribe`,
        physicalAddress,
      });
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
                { 'client.account_state': { _eq: 'active' } },
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
