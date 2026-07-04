# Transactional email templates (MJML)

Every transactional email Earnest sends is authored here as an editable
**MJML** file and rendered at send time. This is separate from **marketing**
email, which lives in the Directus `email_templates` collection and is compiled
by the same MJML compiler but edited in the admin UI.

## How it fits together

```
server/emails/_layout.mjml        ← shared branded chrome (header + footer)
server/emails/<name>.mjml          ← per-email content sections
        │
        ▼
server/utils/email-templates.ts    ← renderBrandedTemplate(name, vars, { org })
        │   • loads _layout + <name>, injects content at <!-- @CONTENT -->
        │   • computes brand vars from `org` (logo, brand_color, whitelabel)
        │   • compiles via server/utils/mjml-compiler.ts (MJML + Handlebars)
        ▼
server/utils/email-send.ts         ← sendBrandedEmail(...) → SendGrid
```

A sender builds a `vars` object and calls the renderer:

```ts
import { renderBrandedTemplate } from '~~/server/utils/email-templates';
import { sendBrandedEmail } from '~~/server/utils/email-send';

const { html, text } = await renderBrandedTemplate('welcome', {
  subject: 'Welcome to Earnest',      // → <title> + used by sendBrandedEmail
  preheader: 'Your workspace is ready.', // → inbox preview line
  firstName: 'Alex',                  // → template {{firstName}}
  orgName: 'Northwind Studio',
  ctaUrl: 'https://app.earnest.guru/',
  text: 'Plain-text alternative…',    // optional; auto-derived from HTML if omitted
}, { org });                          // omit `org` → Earnest chrome; pass it → org-branded

await sendBrandedEmail({ to, subject, html, text, org, categories: ['transactional', 'welcome'] });
```

## Templates

| Template | Sent by | Chrome |
|---|---|---|
| `welcome` | `server/utils/welcome-email.ts` | Earnest |
| `invite` | `server/utils/invite-email.ts` | org (falls back to Earnest) |
| `notification` | `server/utils/notification-emails.ts` | org / Earnest |
| `password-reset` | `server/api/directus/users/password-reset-request.post.ts` | Earnest |
| `video-invite` | `server/api/video/create-room.post.ts`, `send-email-invite.post.ts` | org / Earnest |
| `generic` | `server/utils/ai-action-executors.ts` (AI send_email) | org |
| `meeting-invited` · `meeting-time-changed` · `meeting-removed` · `meeting-cancelled` · `meeting-reminder` | `server/utils/meeting-emails.ts` | org / Earnest |

## Editing / adding a template

1. **Content only** — each `<name>.mjml` is just the MJML *sections* (`<mj-section>…`)
   that get injected into `_layout.mjml`. Don't add `<mjml>`/`<mj-body>` — the
   layout provides them. Header/footer/branding come from the layout.
2. **Variables** — `{{var}}` is HTML-escaped by Handlebars (use for all
   user/dynamic text). `{{{var}}}` is raw — use ONLY for server-built,
   already-escaped HTML fragments; name those vars `*Html`. Conditionals and
   loops use Handlebars: `{{#if ctaUrl}}…{{/if}}`, `{{#each detailRows}}…{{/each}}`.
3. **Brand vars available in every template** (computed by the renderer from
   `org`): `useOrg`, `orgName`, `brandColor`, `logoUrl`, `orgWebsite`,
   `whitelabel`, plus `subject`/`preheader` from your vars. Buttons use
   `background-color="{{brandColor}}"`.
4. **New template** — drop `server/emails/<name>.mjml`, call
   `renderBrandedTemplate('<name>', …)` from your sender, and add it to the
   preview (below).

## Previewing locally

- **Page:** `/email/preview-transactional` — template picker + Earnest/org
  toggle, live in an iframe. Edit a `.mjml` file, refresh.
- **Raw:** `GET /api/email/preview-mjml?template=<name>&brand=earnest|org`
  (add `&format=json` for `{ html, text, errors }`, `&org=<id>` for a real
  org's brand). Open in dev; auth-gated in prod.
- Register sample data for a new template in
  `server/api/email/preview-mjml.get.ts` (the `sampleVars` switch + the
  `TRANSACTIONAL_TEMPLATES` list) and add its name to the page's `templates`
  array in `app/pages/email/preview-transactional.vue`.

## Prod bundling (important)

The `.mjml` files are bundled into the server build via
`nitro.serverAssets` (`nuxt.config.ts` → `{ baseName: 'emails', dir:
'server/emails' }`) and read from the `assets:emails` storage. In dev that
storage isn't populated, so the loader falls back to a direct disk read from
`server/emails/`. **After deploying, spot-check one email** (e.g. the preview
endpoint) to confirm the bundled path resolves in the serverless runtime.

## Notes

- `server/utils/email-shell.ts` (the older inline-HTML shell) is retained only
  for `injectMarketingFooter()` and shared helpers (`escapeHtml`, `OrgBrandRef`).
  New transactional emails should use MJML templates, not the shell.
- Email-client constraints still apply: the layout uses inline styles, a 560px
  container, a system sans-serif stack, and no external CSS/JS.
