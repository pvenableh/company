/**
 * Send a test email to a single address.
 * Used by the template editor "Send Test" button.
 */
import sgMail from '@sendgrid/mail';
import { compileMjml, compileSubject } from '~/server/utils/mjml-compiler';
import { readItems } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const { template_id, to_email, sample_variables = {} } = await readBody(event);

  if (!template_id || !to_email) {
    throw createError({ statusCode: 400, message: 'template_id and to_email are required' });
  }

  const apiKey = config.sendgridApiKey || config.SENDGRID_API_KEY;
  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'SendGrid API key not configured' });
  }

  sgMail.setApiKey(apiKey);

  // Fetch the template from Directus
  const directus = getTypedDirectus();
  const templates = await directus.request(
    readItems('email_templates', {
      filter: { id: { _eq: template_id } },
      limit: 1,
    })
  );

  const template = (templates as any[])?.[0];
  if (!template) {
    return { success: false, error: 'Template not found' };
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

  try {
    if (!template.mjml_source) {
      return { success: false, error: 'Template has no compiled MJML. Save the template first.' };
    }

    const result = compileMjml(template.mjml_source, variables);
    if (!result.html) {
      return { success: false, error: `MJML compile error: ${result.errors.join(', ')}` };
    }

    const subject = template.subject_template
      ? compileSubject(template.subject_template, variables)
      : `[TEST] ${template.name}`;

    const fromEmail = config.sendgridFromEmail || config.FROM_EMAIL || 'hello@huestudios.company';
    const fromName = config.sendgridFromName || 'Hue Creative Agency';

    await sgMail.send({
      to: to_email,
      from: {
        email: fromEmail,
        name: `[TEST] ${fromName}`,
      },
      subject: `[TEST] ${subject}`,
      html: result.html,
    });

    return { success: true, message: `Test email sent to ${to_email}` };
  } catch (err: any) {
    console.error('[email/test-send] Error:', err.message);
    return { success: false, error: err.message };
  }
});
