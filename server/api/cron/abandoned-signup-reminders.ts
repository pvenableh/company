/**
 * Abandoned-signup reminder cron (Phase 4).
 *
 * Nudges people who started the password-at-end signup but never finished. The
 * cadence is deliberately gentle so it never nags:
 *   • First reminder ~24h after the last activity on the draft.
 *   • Then weekly, capped at SIGNUP_REMINDER_MAX total reminders (default 3),
 *     after which the draft is left alone.
 *
 * A draft becomes eligible again only if it's still `active` (completing the
 * signup flips it to `completed`, which excludes it). The resume link drops the
 * user back into /register?token=… exactly where they left off.
 *
 * Platform email (Earnest is the sender, no org yet) — sends via sendBrandedEmail
 * directly, bypassing the per-org outbound gate.
 *
 * Auth: `cronSecret` Bearer header (Vercel Cron). Manual triggers require a
 * platform admin. Master off-switch: SIGNUP_REMINDERS_DISABLED=true.
 * Run daily — see vercel.json crons.
 */
import { readItems, updateItem } from '@directus/sdk';
import { sendSignupReminderEmail } from '~~/server/utils/signup-reminder-email';

const FIRST_DELAY_MS = 24 * 60 * 60 * 1000;   // 24h after abandonment
const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;    // then weekly
const BATCH = 200;                             // cap work per run

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig() as any;
  const cronSecret = config.cronSecret;
  const authHeader = getHeader(event, 'authorization');

  if (authHeader === `Bearer ${cronSecret}` && cronSecret) {
    // authenticated via cron secret
  } else {
    // Manual trigger — platform admins only (no org context here).
    await requirePlatformAdmin(event);
  }

  if (String(process.env.SIGNUP_REMINDERS_DISABLED).toLowerCase() === 'true') {
    return { ok: true, disabled: true, sent: 0 };
  }

  const MAX_REMINDERS = Math.max(1, Number(process.env.SIGNUP_REMINDER_MAX) || 3);
  const appUrl = String(config.public?.appUrl || config.public?.siteUrl || 'https://app.earnest.guru').replace(/\/$/, '');

  const now = Date.now();
  const firstCutoff = new Date(now - FIRST_DELAY_MS).toISOString();

  const directus = getServerDirectus();

  // Candidates: still active, has an email, under the reminder cap, and last
  // touched > 24h ago (so we never email someone mid-signup). The weekly-spacing
  // check for already-reminded drafts is applied in code below.
  const drafts = (await directus.request(
    readItems('signup_drafts', {
      filter: {
        status: { _eq: 'active' },
        email: { _nnull: true },
        reminders_sent: { _lt: MAX_REMINDERS },
        last_activity: { _lt: firstCutoff },
      },
      fields: ['id', 'token', 'email', 'first_name', 'last_activity', 'reminders_sent', 'last_reminded_at'],
      sort: ['last_activity'],
      limit: BATCH,
    }),
  )) as Array<{
    id: number; token: string; email: string | null; first_name: string | null;
    last_activity: string | null; reminders_sent: number | null; last_reminded_at: string | null;
  }>;

  let sent = 0, skipped = 0, failed = 0;

  for (const d of drafts) {
    const count = d.reminders_sent || 0;
    // Due? First reminder is already gated by the 24h filter; later ones need a
    // week since the last reminder.
    let due = count === 0;
    if (!due) {
      const lastRem = d.last_reminded_at ? Date.parse(d.last_reminded_at) : 0;
      due = now - lastRem >= WEEKLY_MS;
    }
    if (!due || !d.email || !d.token) { skipped++; continue; }

    const res = await sendSignupReminderEmail({
      to: d.email,
      firstName: d.first_name,
      resumeUrl: `${appUrl}/register?token=${d.token}`,
      reminderNumber: count + 1,
    });

    if (res.sent) {
      sent++;
      await directus.request(
        updateItem('signup_drafts', d.id, {
          reminders_sent: count + 1,
          last_reminded_at: new Date().toISOString(),
        }),
      ).catch((e: any) => console.warn('[abandoned-signup-reminders] mark failed:', e?.message));
    } else {
      failed++;
    }
  }

  return { ok: true, scanned: drafts.length, sent, skipped, failed, max: MAX_REMINDERS };
});
