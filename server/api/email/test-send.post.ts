/**
 * Send a test email — supports two modes:
 *
 * 1. template-mode (existing): pass `template_id`, sends the compiled MJML
 *    from `email_templates`. Marketing/template-editor "Send Test" button.
 *
 * 2. shell-mode (new): pass `shell: 'earnest' | 'org'` to send the Stage-1
 *    transactional shell with sample copy. When `org` is selected, pass
 *    `org_id` to pick the org context (logo/brand_color/reply-to).
 *
 * Used by the new /api/email/preview QA endpoint and the soon-to-be admin
 * UI for verifying branded chrome.
 */
import { readItems } from '@directus/sdk';
import { compileMjml, compileSubject } from '~~/server/utils/mjml-compiler';
import { renderEarnestEmail, renderOrgEmail } from '~~/server/utils/email-shell';
import { sendBrandedEmail, fetchOrgBrand } from '~~/server/utils/email-send';

interface RequestBody {
  template_id?: string;
  to_email?: string;
  sample_variables?: Record<string, any>;
  /** New: 'earnest' or 'org' — picks one of the Stage-1 transactional shells. */
  shell?: 'earnest' | 'org';
  /** Required when shell === 'org'. */
  org_id?: string;
  /** Optional override for the preview heading/subject in shell-mode. */
  preview_subject?: string;
  preview_heading?: string;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig() as any;
  const body = await readBody<RequestBody>(event);
  const to_email = body?.to_email;

  if (!to_email) {
    throw createError({ statusCode: 400, message: 'to_email is required' });
  }

  if (!config.sendgridApiKey) {
    throw createError({ statusCode: 500, message: 'SendGrid API key not configured' });
  }

  // ── Shell-mode (Stage 1 transactional preview) ──
  if (body.shell === 'earnest' || body.shell === 'org') {
    const subject = `[TEST] ${body.preview_subject || 'Transactional shell preview'}`;
    const heading = body.preview_heading || 'This is a transactional preview';
    const bodyHtml = `
      <p style="margin:0 0 12px;">Hi there,</p>
      <p style="margin:0 0 12px;">This is what a Stage-1 transactional email looks like when it lands in your inbox. The chrome above and below adapts to the sender — Earnest for our own emails, your org's logo + brand color for client-facing notifications.</p>
      <p style="margin:0 0 12px;">Body copy uses a system sans-serif stack with comfortable line-height. Long bodies wrap; short bodies look clean.</p>
    `;
    const cta = { label: 'See it in Earnest', url: config.public?.appUrl || 'https://app.earnest.guru' };

    let rendered: { html: string; text: string };
    let org = null as any;
    if (body.shell === 'org') {
      if (!body.org_id) {
        throw createError({ statusCode: 400, message: 'org_id is required when shell=org' });
      }
      org = await fetchOrgBrand(body.org_id);
      if (!org) {
        throw createError({ statusCode: 404, message: `Org ${body.org_id} not found` });
      }
      rendered = renderOrgEmail({ org, subject, heading, bodyHtml, cta });
    } else {
      rendered = renderEarnestEmail({ subject, heading, bodyHtml, cta });
    }

    const res = await sendBrandedEmail({
      to: to_email,
      subject,
      html: rendered.html,
      text: rendered.text,
      org,
      categories: ['test', 'shell-preview', body.shell],
    });
    return res.sent
      ? { success: true, message: `Test email sent to ${to_email}` }
      : { success: false, error: res.reason || 'Send failed' };
  }

  // ── Template-mode (existing MJML editor send) ──
  const template_id = body?.template_id;
  const sample_variables = body?.sample_variables || {};
  if (!template_id) {
    throw createError({ statusCode: 400, message: 'template_id is required (or pass shell=earnest|org)' });
  }

  try {
    const directus = await getUserDirectus(event);
    const templates = await directus.request(
      readItems('email_templates', {
        filter: { id: { _eq: template_id } },
        limit: 1,
      }),
    );

    const template = (templates as any[])?.[0];
    if (!template) return { success: false, error: 'Template not found' };
    if (!template.mjml_source) {
      return { success: false, error: 'Template has no compiled MJML. Save the template first.' };
    }

    const variables = {
      first_name: 'Test',
      last_name: 'User',
      email: to_email,
      year: new Date().getFullYear(),
      app_name: config.public?.companyName || 'Your Organization',
      unsubscribe_url: '#',
      ...sample_variables,
    };

    const result = compileMjml(template.mjml_source, variables);
    if (!result.html) {
      return { success: false, error: `MJML compile error: ${result.errors.join(', ')}` };
    }

    const subject = template.subject_template
      ? compileSubject(template.subject_template, variables)
      : `[TEST] ${template.name}`;

    const sgMail = await import('@sendgrid/mail');
    sgMail.default.setApiKey(config.sendgridApiKey);
    const fromEmail = config.sendgridFromEmail || config.FROM_EMAIL || 'hello@earnest.guru';
    const fromName = config.sendgridFromName || 'Earnest';
    await sgMail.default.send({
      to: to_email,
      from: { email: fromEmail, name: `[TEST] ${fromName}` },
      subject: `[TEST] ${subject}`,
      html: result.html,
    });

    return { success: true, message: `Test email sent to ${to_email}` };
  } catch (err: any) {
    console.error('[email/test-send] Error:', err.message, err.response?.body || '');
    return { success: false, error: err.message || 'Failed to send test email' };
  }
});
