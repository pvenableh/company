# Session 18 — Finish the document system (post-launch)

**Status:** Not started
**Blocker:** none. Foundations in main: `service_templates`, `document_blocks`, `contracts`, `<DocumentHeader>`, `<DocumentFooter>`, `<BlockComposer>`, `<BlockRenderer>`, `/api/ai/draft-proposal/[leadId]`, `/proposals/preview/[id]`.
**Ships:** four small features that bring proposals/contracts to full parity with invoices and add monetization-aware "Powered by Earnest." surfacing.

## Context — what's already in place (commits `0dfbab0` → `6ede3eb`)

The reusable-blocks document system is live. Read these three memo files for the full picture before starting:

- `~/.claude/projects/-Users-peterhoffman-Sites-earnest-earnest/memory/MEMORY.md` (entry: messages/appointments leak close — for the perm patterns)
- `~/.claude/projects/.../memory/reference_directus11_create_perm_quirk.md` (the FK-walk-on-create gotcha + validation field workaround — relevant if you add new schema)
- The most recent commits on `main`: `0dfbab0` (AI drafter + service templates), `03d9694` (blocks + contracts + preview), `6ede3eb` (footer)

Architecture today:
- **service_templates** = the spine of a proposal (one chosen per draft). Managed at `/organization/service-templates`.
- **document_blocks** = reusable paragraphs (bio, references, terms, NDA, deliverables, etc.). `applies_to: ['proposals', 'contracts']`. Managed at `/organization/document-blocks`.
- **proposals** has a `blocks: jsonb[]` field — ordered array of `{ block_id, heading, content, page_break_after }`. Library-block refs use `block_id`; one-off inline blocks have `block_id: null` with a "Save to library" button on the composer.
- **contracts** mirror proposals + add signing fields (`signed_at`, `signed_by_name/email/ip`, `signature_data`, `signing_token`).
- `/proposals/[id]` renders the `<BlockComposer>` for editing; `/proposals/preview/[id]` renders `<DocumentHeader>` + `<BlockRenderer>` + `<DocumentFooter>` for client-facing view.
- `/api/ai/draft-proposal/[leadId]` composes a blocks array (mixing library-block refs + AI-drafted custom blocks) and the `AI Draft` button on `/leads/[id]` creates the proposal + navigates to the editor.

## Track 1 — Wire `<DocumentFooter>` into invoices + contracts public render

`<DocumentFooter>` is shipped in `/proposals/preview/[id]`. Bring it to the other two document types so the user's "every contract, proposal, and invoice" requirement holds.

1. **Invoices**: edit `app/components/Invoices/Invoice.vue` — add `<DocumentsDocumentFooter />` immediately after the closing tag of the totals/line-items wrapper (the existing div that ends with the "Total:" row). Should appear at the very bottom of the rendered card. Verify on the public payment preview (`/invoices/preview/[id]`) — DocumentFooter should render below the totals.
2. **PDF generation**: `app/components/Invoices/PdfGenerator.vue` builds the invoice PDF — confirm the footer ends up in the rasterized PDF (it will if PdfGenerator wraps the same `<InvoicesInvoice>` component, otherwise the PDF generator has its own template that needs updating).
3. **Contracts public view**: not yet built. When you build it (Track 4 below), include `<DocumentsDocumentFooter />`.

## Track 2 — Whitelabel opt-out (paid-tier only)

Pre-condition for Track 1 to feel right for paying users. Add an org-level toggle that hides the footer.

1. **Schema**: add `organizations.whitelabel: boolean default false`. Use the existing setup-script pattern (e.g. `scripts/setup-organization-permissions.ts` is similar). Idempotent — skip if field exists.
2. **Plan gating**: only show the toggle to plans that include whitelabel. Per memory `reference_stripe_wiring.md`, the plans are `free | solo | studio | agency | enterprise`. Recommendation: enable for `studio | agency | enterprise` (gate on `org.plan` in the UI). Lower tiers see a tooltip: "Upgrade to Studio to remove this badge."
3. **UI**: add a "Branding" card to `/organization/index.vue` with a single toggle: `[ ] Hide "Powered by Earnest." on client-facing documents`. Disabled with the upsell tooltip on Free/Solo.
4. **Render**: `<DocumentFooter>` should accept a `:hidden="boolean"` prop (or pull `useOrganization().selectedOrgRecord.whitelabel` directly). When hidden, render nothing. Apply the gating in proposal preview, invoice render, and contract render.

## Track 3 — Cover page styling

The model already supports covers (`category: 'cover'` block + `page_break_after: true`). What's missing is *cover-specific layout* so they actually feel like covers.

Detection: `<BlockRenderer>` should treat the FIRST entry as the cover when `entry.heading?.match(/^cover/i)` OR the entry has a flag, OR (simplest) when it's first AND has `page_break_after: true`. Recommend the `page_break_after` heuristic — no schema change.

Cover layout (in `<BlockRenderer>`, conditionally swap the first-block render):
- Full-bleed white card (or whatever base color) at min-height ~80vh
- Centered org logo (use the same source as DocumentHeader — `seller.logo` from the parent component, pass it down as a prop)
- Below logo: the proposal title (from `proposal.title`)
- Below title: recipient block ("Prepared for {company}")
- Bottom of cover: date sent + valid_until in small text
- After the cover, the rest of the blocks render in normal layout with the existing seller header at the top of "page 2"

Implementation note: the cover layout needs access to the proposal's *parent* metadata (title, recipient, date). Easiest path: split `<BlockRenderer>` into two — one for the cover (gets the seller/recipient/title context as props) and one for the rest (just the markdown content). Or pass a `:cover-context` prop to BlockRenderer that it spreads into the first block when applicable.

## Track 4 — Contract render parity + signing flow

`contracts` collection ships in `03d9694` but no UI yet. Mirror the proposals UX:

1. `/contracts/index.vue` — list view (filter, search, status pills); copy from `/proposals/index.vue`.
2. `/contracts/[id].vue` — detail with `<BlockComposer>` (same component, just `applies-to="contracts"`). Status timeline: draft → sent → signed/declined/cancelled.
3. `/contracts/preview/[id].vue` — public-facing view, mirrors `/proposals/preview/[id]` but adds a signature block at the bottom when `contract_status === 'sent'`. Signature UI: typed name + checkbox affirming signature OR canvas-drawn (start with typed name, simpler).
4. **Public unauth signing route**: `/contracts/sign/[token].vue` — uses `signing_token` for unauth access. Server route `/api/contracts/sign.post.ts` (admin token) accepts `{ token, name, email, signature_data }`, validates the token, sets `signed_at = now()`, `signed_by_*`, transitions status to `signed`.
5. **Generate contract from proposal**: button on `/proposals/[id]` ("Convert to contract") → server route `/api/contracts/from-proposal/[proposalId].post.ts` (admin token + requireOrgMembership) copies title, blocks, total, contact, lead, organization → creates contract row → returns id → navigate to `/contracts/[id]`.

## Track 5 — Polish + bugs surfaced during the build

These came up while building tracks 1–4 and are noted but not blocking:

- **service_templates double-create**: when `pnpm tsx /tmp/seed-templates.ts` first failed with a top-level-await error, three rows still landed (curl-loop fallthrough). The script ran cleanly the second time but I had to manually delete the dupes. Add a `name + organization` UNIQUE constraint to `service_templates` (and `document_blocks` for the same reason).
- **service_templates id type**: the setup script intended `uuid` (`meta.special: ['uuid']`) but Directus created the column as integer. The 3 demo rows have integer ids (1/2/3). Either re-create with proper uuid schema OR accept integer ids and update `useServiceTemplates.ts`'s `ServiceTemplate.id: string` to `string | number`. Integer is fine for a small reference table.
- **Block library refs from AI**: the AI proposal-drafter currently returns `block_id: null` for ALL blocks, even when the content matches a library block. Tighten the system prompt: when the LLM picks a block whose CONTENT matches a library block name verbatim, force `block_id` to the library uuid. Or: post-process server-side — after the LLM returns blocks, fuzzy-match each block's heading against the library and set `block_id` if there's a strong match.
- **Block composer drag-and-drop**: currently up/down arrows. Drag is the natural interaction — add `vuedraggable@next` (Vue-3-compatible) for proper drag-and-drop reorder.
- **`v-html` on invoice notes**: `Invoice.vue:79` does `v-html="invoice.note"` directly — XSS risk if note is user-controlled (which it is). Sanitize via `dompurify` or render markdown via the same `marked` lib used in `<BlockRenderer>`.

## DoD

- DocumentFooter renders on invoices + contracts (when shipped). Hidden when `org.whitelabel === true` AND plan is Studio/Agency/Enterprise.
- Cover blocks (`page_break_after: true` on entry 0) get the special layout.
- Contracts have a working list/detail/preview/sign flow.
- All 5 polish items resolved or explicitly deferred with reasons.
- Memory updated: append a closure note to `MEMORY.md` and the relevant project memo.

## Reference files

- Composables: `app/composables/useServiceTemplates.ts`, `app/composables/useDocumentBlocks.ts`, `app/composables/useProposals.ts`
- Components: `app/components/Documents/{DocumentHeader,DocumentFooter,BlockComposer,BlockRenderer}.vue`, `app/components/DocumentBlocks/`, `app/components/ServiceTemplates/`
- Pages: `app/pages/organization/{service-templates,document-blocks}.vue`, `app/pages/proposals/{[id],preview/[id]}.vue`, `app/pages/leads/[id].vue` (AI Draft button)
- Server: `server/api/ai/draft-proposal/[leadId].post.ts`
- Scripts: `scripts/setup-{service-templates,document-blocks,contracts}.ts`
- Templates for new server routes: `server/api/messages/index.post.ts` (admin-token + `requireOrgMembership` pattern)

## Notes for Claude

- Run against prod `admin.earnest.guru`. Demo creds: `DEMO_USER_PASSWORD` / `DEMO_AGENCY_USER_PASSWORD`. Solo org `40c4d2e5-79d2-4008-9a97-9c14f94dfd0e`; Agency `d409875b-01d7-4f85-84c8-01c9badbb338`.
- Solo demo has 3 service templates (id 1-3) and 5 library blocks already seeded for testing.
- Dev server: use `http://127.0.0.1:<port>`, not `localhost` (memory `reference_dev_server_ipv6.md`). Cookies are scoped to host so login via 127.0.0.1 from the start.
- Worktree caveat: pnpm dev runs from `/Users/peterhoffman/Sites/earnest/earnest` (parent), not the worktree. Update `.claude/launch.json` accordingly but DON'T commit the modified version.
