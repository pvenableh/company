/**
 * Send the org-welcome transactional email.
 *
 * Non-fatal: returns silently on any failure (missing API key, send error).
 * Failure paths log to console for diagnosis. Caller should not await this
 * inside a critical path — keep it best-effort.
 */
import sgMail from '@sendgrid/mail';

interface WelcomeEmailParams {
  to: string;
  firstName?: string | null;
  orgName: string;
  plan: string;
  dashboardUrl?: string;
}

export async function sendOrgWelcomeEmail(params: WelcomeEmailParams): Promise<{ sent: boolean; reason?: string }> {
  const { to, firstName, orgName, plan } = params;

  try {
    const config = useRuntimeConfig();
    const apiKey = (config as any).sendgridApiKey || (config as any).SENDGRID_API_KEY;

    if (!apiKey) {
      return { sent: false, reason: 'SendGrid API key not configured' };
    }
    if (!to) {
      return { sent: false, reason: 'No recipient email' };
    }

    sgMail.setApiKey(apiKey as string);

    const fromEmail = (config as any).sendgridFromEmail || (config as any).FROM_EMAIL || 'hello@earnest.guru';
    const fromName = (config as any).sendgridFromName || 'Earnest';
    const appUrl = (config as any).public?.appUrl || (config as any).public?.siteUrl || 'https://app.earnest.guru';
    const dashboardUrl = params.dashboardUrl || `${appUrl}/`;

    const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
    const planLabel = plan === 'free'
      ? 'Free'
      : plan.charAt(0).toUpperCase() + plan.slice(1);

    // Plain HTML — keeps the welcome email lightweight, no MJML compile cost.
    const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#faf7f4;padding:32px 16px;color:#141210;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
    <h1 style="font-size:22px;margin:0 0 12px;font-weight:600;">Welcome to Earnest, ${escapeHtml(orgName)}!</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#444;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#444;">
      Your organization <strong>${escapeHtml(orgName)}</strong> is set up on the
      <strong>${escapeHtml(planLabel)}</strong> plan and ready to go.
    </p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#444;">
      The dashboard is the fastest way to get started — invite teammates,
      bring in clients, and start tracking work.
    </p>
    <a href="${dashboardUrl}" style="display:inline-block;background:#141210;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:500;">
      Open your dashboard
    </a>
    <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#888;">
      Questions? Just reply to this email — a real person reads it.
    </p>
  </div>
  <p style="text-align:center;margin:16px 0 0;font-size:11px;color:#aaa;">
    Earnest · Built for working hands
  </p>
</body></html>`;

    await sgMail.send({
      to,
      from: { email: fromEmail, name: fromName },
      subject: `Welcome to Earnest — ${orgName} is ready`,
      html,
    });

    return { sent: true };
  } catch (err: any) {
    console.warn('[welcome-email] Send failed (non-fatal):', err?.message || err);
    return { sent: false, reason: err?.message || 'unknown error' };
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}
