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
import { readItem } from '@directus/sdk';
import { compileMjml, compileSubject } from '~~/server/utils/mjml-compiler';
import { renderEarnestEmail, renderOrgEmail } from '~~/server/utils/email-shell';
import { sendBrandedEmail, fetchOrgBrand } from '~~/server/utils/email-send';
import { requireOrgMembership } from '~~/server/utils/marketing-perms';

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

  // Single-recipient string only. SendGrid's `to` field accepts arrays and an
  // unauthenticated caller passing one would fan a branded email out. We gate
  // auth below, but defense-in-depth on the recipient shape is cheap.
  if (!to_email || typeof to_email !== 'string' || !to_email.includes('@')) {
    throw createError({ statusCode: 400, message: 'to_email is required (single email address)' });
  }

  if (!config.sendgridApiKey) {
    throw createError({ statusCode: 500, message: 'SendGrid API key not configured' });
  }

  // Auth gate for BOTH modes. Without this, anyone could anonymously send
  // an email branded as any tenant (shell-mode) or send a starter template
  // to arbitrary addresses (template-mode). Mirrors the pattern landed in
  // server/api/email/newsletter-send.post.ts (commit ae56180).
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  // ── Shell-mode (Stage 1 transactional preview) ──
  if (body.shell === 'earnest' || body.shell === 'org') {
    // Org-shell mode impersonates the org's brand chrome. Require the caller
    // to actually belong to that org.
    if (body.shell === 'org') {
      if (!body.org_id) {
        throw createError({ statusCode: 400, message: 'org_id is required when shell=org' });
      }
      await requireOrgMembership(event, body.org_id);
    }
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
      org = await fetchOrgBrand(body.org_id!);
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

  // Read via service token so the ownership check below is enforceable
  // regardless of the caller's RBAC. Then gate on org membership for the
  // template's org (or accept platform starters). Same shape as
  // server/api/email/newsletter-send.post.ts:77-94.
  //
  // Kept OUTSIDE the catch-all try below so 401/403 thrown by
  // requireOrgMembership propagate as real auth errors instead of being
  // downgraded to 200 { success: false }.
  const adminDirectus = getServerDirectus();
  const template = (await adminDirectus
    .request(
      readItem('email_templates', template_id, {
        fields: ['id', 'name', 'subject_template', 'mjml_source', 'organization', 'is_starter'],
      }),
    )
    .catch(() => null)) as any;

  if (!template) return { success: false, error: 'Template not found' };
  if (!template.is_starter) {
    const templateOrg = typeof template.organization === 'string'
      ? template.organization
      : template.organization?.id;
    if (!templateOrg) {
      throw createError({ statusCode: 403, message: 'Template is not associated with an organization' });
    }
    await requireOrgMembership(event, templateOrg);
  }
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

  // Route through sendBrandedEmail so the same `earnest` category + custom_args
  // policy applies as the live newsletter path — otherwise webhook events for
  // test sends come through stripped of organization / email_name / send_id
  // and look identical to foreign events on the shared SendGrid account.
  const templateOrgId = typeof template.organization === 'string'
    ? template.organization
    : template.organization?.id;
  const org = templateOrgId ? await fetchOrgBrand(templateOrgId) : null;

  const res = await sendBrandedEmail({
    to: to_email,
    subject: `[TEST] ${subject}`,
    html: result.html,
    org,
    categories: ['marketing', `newsletter-template-${template_id}`, 'test'],
    emailName: `test:${template.name || `template-${template_id}`}`,
    sendCollection: 'email_templates',
    sendId: template_id,
    customArgs: { template_id: String(template_id) },
  });

  return res.sent
    ? { success: true, message: `Test email sent to ${to_email}` }
    : { success: false, error: res.reason || 'Failed to send test email' };
});
