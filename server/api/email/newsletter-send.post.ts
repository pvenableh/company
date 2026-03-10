/**
 * Send a newsletter to mailing lists, individual recipients, or both.
 * Uses the pre-compiled MJML from email_templates.mjml_source.
 * Supports list-based targeting with deduplication.
 */
import sgMail from '@sendgrid/mail';
import { compileMjml, compileSubject } from '~/server/utils/mjml-compiler';
import { buildContactVariableMap } from '~/server/utils/contact-variables';
import { readItems, readItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const {
    template_id,
    target_lists,
    recipient_ids,
    cc_list,
    bcc_list,
    custom_variables,
  } = await readBody(event);

  if (!template_id) {
    throw createError({ statusCode: 400, message: 'template_id is required' });
  }

  if (!target_lists?.length && !recipient_ids?.length) {
    throw createError({
      statusCode: 400,
      message: 'target_lists or recipient_ids is required',
    });
  }

  const apiKey = config.sendgridApiKey || config.SENDGRID_API_KEY;
  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'SendGrid API key not configured' });
  }

  sgMail.setApiKey(apiKey as string);
  const directus = getTypedDirectus();

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
                { 'contact_id.status': { _eq: 'active' } },
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
          contacts.push({
            ...contact,
            custom_fields: {
              ...(contact.custom_fields || {}),
              ...(member.custom_fields || {}),
            },
          });
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
            { status: { _eq: 'active' } },
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

  const fromEmail = config.sendgridFromEmail || config.FROM_EMAIL || 'hello@huestudios.company';
  const fromName = config.sendgridFromName || 'Hue Creative Agency';
  const appName = (config.public?.companyName as string) || fromName;
  const siteUrl = (config.public?.siteUrl as string) || 'https://huestudios.company';

  const errors: string[] = [];
  let sentCount = 0;

  // Send one email per recipient for personalization
  for (const contact of contacts) {
    const variables = buildContactVariableMap(contact, {
      appName,
      appUrl: siteUrl,
      year: new Date().getFullYear(),
      announcementCustomVars: custom_variables || {},
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

  return {
    success: errors.length === 0,
    sent: sentCount,
    total: contacts.length,
    errors: errors.length > 0 ? errors : undefined,
  };
});
