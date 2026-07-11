# CardDesk → Org AI-Usage Attribution — Backend Spec

**Audience:** the CardDesk backend team (the separate `carddesk.earnest.guru` deployment).
**Status:** proposed. Requires a change in the CardDesk backend only. **No Earnest-app change is required** for CardDesk usage to appear in the org rollup (see §5).
**Owner:** Earnest platform.

---

## 1. Problem

The Earnest **Organization → AI & Tokens** floor shows a per-org AI usage rollup —
requests, tokens, estimated cost, active users, a daily chart, a "By Feature"
(endpoint) breakdown, and a "By Member" breakdown. It is built entirely from the
`ai_usage_logs` collection, filtered by `organization`.

CardDesk's AI (business-card OCR / enrichment "scans") runs in a **separate
backend deployment**. It meters **scan credits** against
`organizations.scan_credits_balance` but **never writes `ai_usage_logs`**.
Result: CardDesk's real Anthropic token spend is invisible in the org rollup, so
the "total AI cost" an org sees understates reality.

**Goal:** have the CardDesk backend write one `ai_usage_logs` row per scan, with
the owning organization attributed, so CardDesk spend shows up in the existing
Earnest rollup with zero further work on the Earnest side.

---

## 2. The `ai_usage_logs` contract

Both apps talk to the **same** Directus (there is one production Directus). The
CardDesk backend already has (or can mint) an admin/service token for it.

Write one row per scan into the `ai_usage_logs` collection with these fields
(this is the exact shape Earnest writes today — see
`server/utils/ai-usage.ts` `logAIUsage`):

| field            | type            | required | value for a CardDesk scan |
|------------------|-----------------|----------|---------------------------|
| `user`           | uuid (m2o users)| yes*     | the acting user's `directus_users` id (see §3) |
| `organization`   | uuid (m2o orgs) | **yes**  | the owning org id (see §3) — **this is what the rollup filters on** |
| `endpoint`       | string          | yes      | `carddesk/scan` (namespaced; becomes the "By Feature" label) |
| `model`          | string          | yes      | the exact Anthropic model id used, e.g. `claude-haiku-4-5` |
| `input_tokens`   | integer         | yes      | `usage.input_tokens` from the Anthropic response |
| `output_tokens`  | integer         | yes      | `usage.output_tokens` from the Anthropic response |
| `total_tokens`   | integer         | yes      | `input_tokens + output_tokens` |
| `estimated_cost` | decimal         | yes      | USD, 6-dp; see §4 |
| `session_id`     | string          | no       | leave null (or a scan/batch id if useful) |
| `metadata`       | json            | no       | `{ "product": "carddesk", "scanId": "<id>", "cardId": "<id>" }` |
| `date_created`   | timestamp       | auto     | Directus sets this (`date-created` special) |

\* `user` is used only for the "By Member" breakdown and active-user count. If a
scan genuinely has no Earnest user actor, it may be null — but `organization`
must always be set or the row will not appear in any org rollup.

> **Do not** invent new fields. The rollup selects a fixed field set
> (`input_tokens, output_tokens, total_tokens, estimated_cost, user,
> date_created, endpoint`); extra data belongs in `metadata`.

---

## 3. Org attribution (the actual work)

The rollup query is, verbatim (`server/utils/ai-date-range.ts`
`buildAiUsageFilter` + `server/api/ai/usage/stats.get.ts`):

```
filter: { organization: { _eq: <orgId> }, date_created: { _gte: <periodStart> } }
```

So **every row must carry the correct `organization` uuid.** Getting it is
straightforward because **the org is already known at scan time**:

- CardDesk meters scans against `organizations.scan_credits_balance` — an
  **org-level** field. Whatever code decrements that balance already resolved an
  `organizationId`. Use that same id on the `ai_usage_logs` row. This is the
  primary, correct path.
- Earnest even ships the matching helpers (unused there today, but they document
  the contract): `enforceScanLimits(organizationId)` and
  `deductScanCredit(organizationId)` in
  `server/utils/ai-token-enforcement.ts` — both already take an `organizationId`.

**Fallback if a scan context only has the acting user, not the org**
(`cd_contacts` / card rows have no direct org FK): resolve the org from the
user's active membership:

```
GET /items/org_memberships
  ?filter[user][_eq]=<userId>
  &filter[status][_eq]=active
  &fields=organization
  &limit=1
```

Use `organization` from that row. If a user belongs to multiple orgs, prefer the
org whose `scan_credits_balance` is being decremented for this scan (that is the
billed org and the source of truth); only fall back to "first active membership"
if nothing else disambiguates. Log a warning when you have to guess so we can
tighten it later.

If neither an org nor a decrementable balance can be resolved, **skip the log
row** rather than attributing it to the wrong org — a mis-attributed cost is
worse than a missing one.

---

## 4. Estimated cost

Earnest computes `estimated_cost` from a per-model price table (USD per 1M
tokens) in `server/utils/ai-usage.ts` (`MODEL_PRICING`). Mirror the same
arithmetic so CardDesk and Earnest costs are comparable:

```
cost = (input_tokens * inputPricePer1M + output_tokens * outputPricePer1M) / 1_000_000
estimated_cost = round(cost, 6)   // 6-dp
```

Current rates (keep in sync with `MODEL_PRICING`; treat as the source of truth):

| model                 | input $/1M | output $/1M |
|-----------------------|-----------:|------------:|
| `claude-haiku-4-5`    | 1          | 5           |
| `claude-sonnet-5`     | 3          | 15          |
| `claude-opus-4-8`     | 15         | 75          |

If CardDesk uses a model not in that table, add it to `MODEL_PRICING` in a
coordinated Earnest change; otherwise Earnest's prefix-match falls back to the
sonnet-tier default and the cost will be approximate.

---

## 5. What happens on the Earnest side (nothing, by design)

Once rows land with `organization` set, they flow into the existing rollup with
**no Earnest change**:

- **Totals / cost / daily chart** — include CardDesk rows automatically (they're
  just more `ai_usage_logs` rows for the org).
- **"By Feature"** (`/api/ai/usage/by-endpoint`) — CardDesk appears as its own
  line via the `endpoint` value `carddesk/scan`.
- **"By Member"** (`/api/ai/usage/by-user`) — attributed to `user` when set.

The `metadata.product: "carddesk"` tag is not required for the rows to appear;
it exists so that **if** Earnest later wants an explicit "Earnest vs CardDesk"
split, the data is already there to group on. Building that split is **out of
scope** for this spec (Earnest owner decided to defer the receiving-side
breakdown) — but please write the tag anyway so the option stays open for free.

---

## 6. Idempotency & failure handling

- **Fire-and-forget:** logging must never block or fail a scan. Wrap the write in
  try/catch and swallow errors (mirror `logAIUsage`, which is best-effort).
- **One row per scan:** write after a *successful* Anthropic call, using the real
  returned token usage — not an estimate, and not on failed/blocked scans.
- **No backfill required.** Start logging from deploy; historical scans stay
  unattributed. If a backfill is later wanted, we can reconstruct approximate
  rows from `scans_used_this_period` history in a separate, coordinated effort.

---

## 7. Acceptance check

After deploy, from an org that runs a CardDesk scan:

1. A new `ai_usage_logs` row exists with `endpoint = "carddesk/scan"`, the
   correct `organization`, non-zero `total_tokens`, and a positive
   `estimated_cost`.
2. Earnest → **Organization → AI & Tokens** floor, that org, shows the scan under
   **By Feature → carddesk/scan**, and the totals/cost/daily chart tick up.
3. No user-facing scan latency change (the log is off the hot path).

---

## 8. Reference (Earnest source)

- `server/utils/ai-usage.ts` — `logAIUsage` (the row shape + `MODEL_PRICING`).
- `server/utils/ai-date-range.ts` — `buildAiUsageFilter` (the rollup filter).
- `server/api/ai/usage/{stats,by-endpoint,by-user,recent}.get.ts` — the rollup readers.
- `server/utils/ai-token-enforcement.ts` — `enforceScanLimits` / `deductScanCredit`
  (org id is already in hand at scan time).
- `app/components/Organization/AIUsage.vue` — the UI that renders it.
