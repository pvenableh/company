/**
 * Abandoned-signup reminder email (Phase 4).
 *
 * Platform email — Earnest is the sender, the recipient has no org yet, so it
 * renders with Earnest chrome (no org brand) and does NOT go through the per-org
 * outbound gate. Uses the shared `generic` MJML template. Non-fatal.
 *
 * NOTE: the MJML compiler runs Handlebars with noEscape, so any user-controlled
 * value (first name) is escaped here before interpolation.
 */
import { renderBrandedTemplate } from './email-templates';
import { sendBrandedEmail } from './email-send';
import { escapeHtml } from './email-shell';

interface SignupReminderParams {
  to: string;
  firstName?: string | null;
  resumeUrl: string;
  /** 1 = the 24h nudge; 2+ = the weekly follow-ups (softer copy). */
  reminderNumber: number;
}

export async function sendSignupReminderEmail(params: SignupReminderParams): Promise<{ sent: boolean; reason?: string }> {
  const { to, firstName, resumeUrl, reminderNumber } = params;
  if (!to) return { sent: false, reason: 'No recipient email' };

  const nameEsc = escapeHtml((firstName || '').trim());
  const greeting = nameEsc ? `Hi ${nameEsc},` : 'Hi there,';
  const greetingText = firstName ? `Hi ${firstName},` : 'Hi there,';

  const first = reminderNumber <= 1;
  const subject = first
    ? 'Your Earnest workspace is waiting'
    : 'Still want to finish setting up Earnest?';
  const heading = first ? 'Pick up where you left off' : 'Your workspace is still here';
  const lead = first
    ? `you were partway through setting up your workspace. Everything you entered is saved — pick up right where you left off and you'll be running in a couple of minutes.`
    : `just a gentle nudge — your half-finished setup is still saved. Whenever you're ready, one click drops you back in exactly where you stopped.`;

  const bodyHtml = `<p style="margin:0">${greeting} ${lead}</p>`;
  const text = `${greetingText}\n\n${first
    ? 'You were partway through setting up your Earnest workspace. Everything you entered is saved — pick up where you left off:'
    : 'A gentle nudge — your half-finished Earnest setup is still saved. Pick up where you left off whenever you\'re ready:'}\n\n${resumeUrl}\n\nNot interested? No worries — you can ignore this and we won't keep nudging.`;

  const { html, text: renderedText } = await renderBrandedTemplate('generic', {
    subject,
    preheader: first ? 'Your progress is saved — finish in a couple of minutes.' : 'Still saved whenever you want to finish.',
    heading,
    bodyHtml,
    ctaUrl: resumeUrl,
    ctaLabel: 'Finish setting up',
    text,
  });

  const res = await sendBrandedEmail({
    to,
    subject,
    html,
    text: renderedText || text,
    categories: ['transactional', 'signup-reminder'],
  });
  if (!res.sent) console.warn('[signup-reminder-email] Send failed (non-fatal):', res.reason);
  return res;
}
