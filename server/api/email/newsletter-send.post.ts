/**
 * Send a newsletter to a contact list or array of recipients.
 * Uses the pre-compiled MJML from email_templates.mjml_source.
 */
import sgMail from '@sendgrid/mail';
import { compileMjml, compileSubject } from '~/server/utils/mjml-compiler';
import { readItems, readItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const { template_id, list_id, recipient_ids, cc_list, bcc_list } = await readBody(event);

  if (!template_id) {
    throw createError({ statusCode: 400, message: 'template_id is required' });
  }

  if (!list_id && !recipient_ids) {
    throw createError({ statusCode: 400, message: 'list_id or recipient_ids is required' });
  }

  const apiKey = config.sendgridApiKey || config.SENDGRID_API_KEY;
  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'SendGrid API key not configured' });
  }

  sgMail.setApiKey(apiKey);
  const directus = getTypedDirectus();

  // Fetch the template
  const template = (await directus.request(readItem('email_templates', template_id))) as any;
  if (!template?.mjml_source) {
    throw createError({ statusCode: 400, message: 'Template has no compiled MJML' });
  }

  // Fetch recipients
  let contacts: any[] = [];

  if (list_id) {
    const members = await directus.request(
      readItems('contact_list_members', {
        fields: ['contact_id.*'],
        filter: {
          _and: [
            { list_id: { _eq: list_id } },
            { subscribed: { _eq: true } },
          ],
        },
        limit: -1,
      })
    ) as any[];

    contacts = members
      .map((m: any) => m.contact_id)
      .filter((c: any) => c?.email && c?.email_subscribed !== false);
  } else if (recipient_ids?.length) {
    const fetched = await directus.request(
      readItems('contacts', {
        filter: {
          _and: [
            { id: { _in: recipient_ids } },
            { email_subscribed: { _neq: false } },
          ],
        },
        limit: -1,
      })
    ) as any[];
    contacts = fetched.filter((c: any) => c?.email);
  }

  if (contacts.length === 0) {
    return { success: false, error: 'No eligible recipients found', sent: 0 };
  }

  const fromEmail = config.sendgridFromEmail || config.FROM_EMAIL || 'hello@huestudios.company';
  const fromName = config.sendgridFromName || 'Hue Creative Agency';
  const appName = config.public?.companyName || fromName;
  const siteUrl = config.public?.siteUrl || 'https://huestudios.company';

  const errors: string[] = [];
  let sentCount = 0;

  // Send one email per recipient for personalization
  for (const contact of contacts) {
    const variables = {
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      email: contact.email,
      year: new Date().getFullYear(),
      app_name: appName,
      unsubscribe_url: contact.unsubscribe_token
        ? `${siteUrl}/unsubscribe?token=${contact.unsubscribe_token}`
        : '#unsubscribe',
    };

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
