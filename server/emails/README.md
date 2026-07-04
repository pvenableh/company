# Transactional email templates (MJML)

Every transactional email Earnest sends is authored here as an editable
**MJML** file and rendered at send time. This is separate from **marketing**
email, which lives in the Directus `email_templates` collection and is compiled
by the same MJML compiler but edited in the admin UI.

## How it fits together

```
server/emails/_layout.mjml        ← skeleton: <mjml>/<mj-head>/<mj-body> + 3 markers
server/emails/_header.mjml         ← universal header partial  → <!-- @HEADER -->
server/emails/_footer.mjml         ← universal footer partial  → <!-- @FOOTER -->
server/emails/<name>.mjml          ← per-email content sections → <!-- @CONTENT -->
        │
        ▼
server/utils/email-templates.ts    ← renderBrandedTemplate(name, vars, { org })
        │   • composes _layout with _header + _footer + <name> at the markers
        │   • computes brand vars from `org` (logo, brand_color, whitelabel)
        │   • compiles via server/utils/mjml-compiler.ts (MJML + Handlebars)
        ▼
server/utils/email-send.ts         ← sendBrandedEmail(...) → SendGrid
```

**To restyle the header or footer across every email at once, edit
`_header.mjml` / `_footer.mjml`.** They're org/Earnest-aware (via `useOrg`,
`logoUrl`, `brandColor`, `whitelabel`) and injected into the layout skeleton.

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

## Prod bundling

The `.mjml` files are imported as strings in `email-templates.ts` (see the
static `import … from '../emails/*.mjml'` block). A tiny rollup plugin in
`nuxt.config.ts` (`raw-mjml`) rewrites each `.mjml` import to
`export default "<contents>"`, so the templates are bundled and traced into the
serverless output — the same in dev and prod. `server/emails/mjml-modules.d.ts`
declares the `*.mjml` module type for TypeScript.

> Note: `nitro.serverAssets` + `useStorage('assets:emails')` was tried first but
> came back empty at runtime on Vercel, so we switched to string imports. When
> you add a template, add its `import` + `TEMPLATES` entry in
> `email-templates.ts` (a fs fallback covers ad-hoc names in dev only).

## Notes

- `server/utils/email-shell.ts` (the older inline-HTML shell) is retained only
  for `injectMarketingFooter()` and shared helpers (`escapeHtml`, `OrgBrandRef`).
  New transactional emails should use MJML templates, not the shell.
- Email-client constraints still apply: the layout uses inline styles, a 560px
  container, a system sans-serif stack, and no external CSS/JS.
