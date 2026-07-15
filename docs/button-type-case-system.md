# Button & Label Type‑Case System

_One coherent rule for when text is **Title Case**, **UPPERCASE**, or **sentence case** across the earnest app._

Buttons and labels had drifted into a mix of UPPERCASE and Title Case with no
predictable logic — "New Ticket" next to "CLEAR FILTERS", tab strips shouting in
caps next to Title‑Case toggles. This doc is the single source of truth. When you
add or touch a control, match the case to its **role**, not to whatever the
nearest sibling happens to do.

## The rule in one line

> **Actions are Title Case. Meta‑labels are UPPERCASE. Prose is sentence case.**

An _action_ is something you click to make the app _do_ a thing (create, save,
submit, invite). A _meta‑label_ names or classifies part of the UI (a section, a
tab, a column, a filter state, a nav destination). _Prose_ is a link that reads
as part of a sentence.

## Decision table

| Role | Case | `tracking` | Examples | Where |
|------|------|-----------|----------|-------|
| **Primary action button** (T1) | Title Case | normal | `New Ticket`, `Save Changes`, `Send Invite`, `Create Project` | `<Button size="sm">` |
| **Secondary action button** (T2) | Title Case | normal | `Cancel`, `Add Member`, `Export CSV` | `<Button variant="outline">` |
| **Tertiary / inline action** (T3) | Title Case | normal | `New Task`, `Add File`, `Reply` | `<UiActionButton>` |
| **Section / group label** | UPPERCASE | `tracking-wider` | `TEAM`, `NOTICES`, `RECENT ACTIVITY` | `text-[10px] uppercase tracking-wider` |
| **Tab label** | UPPERCASE | `tracking-wider`/`wide` | `TIMELINE` · `TABLE`, `RIVER` · `BOARD` · `LIST` | `<UTabs>` (handles casing) |
| **Toggle state label** | UPPERCASE | `tracking‑wide` | `MY TICKETS` / `ALL TICKETS`, `UNASSIGNED ONLY` | `text-[10px] uppercase` |
| **Filter chip / pill** | UPPERCASE | `tracking-wide` | `CLEAR FILTERS`, `ARCHIVED`, `ALL DATES` | `text-[10px] uppercase` |
| **Table column header** | UPPERCASE | `tracking-wider` | `NAME`, `STATUS`, `DUE`, `OWNER` | `text-[10px] uppercase tracking-wider` |
| **Field label** (form) | UPPERCASE | `tracking-wider` | `TITLE`, `DUE DATE`, `ASSIGN TO` | `text-[10px] uppercase tracking-wider` |
| **Status / meta badge** | UPPERCASE | `tracking-wider` | `IN PROGRESS`, `RECAP READY` | `text-[10px] uppercase tracking-wider` |
| **Nav link** (destination) | UPPERCASE + chevron | `tracking‑wide` | `VIEW ALL PROJECTS ›` | `<UiViewLink>` |
| **Prose / inline link** | sentence case | normal | "…see the [pricing guide](#) for details" | anchor in text |

## Why this split

- **Actions in Title Case** read as _labels for a verb phrase_ — they're the loud,
  tappable things, and Title Case is how native + web apps universally render
  buttons. Shouting them in caps makes every button compete for attention.
- **Meta‑labels in UPPERCASE + `tracking-wider`** read as _quiet structural
  scaffolding_. The letter‑spacing is what makes small‑caps legible and signals
  "this is a label, not a thing you press." It de‑emphasizes without shrinking.
- **Prose in sentence case** because it lives inside real sentences.

## Quick heuristics

- **Does clicking it change data or navigate to do work?** → it's an action →
  **Title Case**. (`New Task`, `Save`, `Invite`.)
- **Does it name a region, a view, a column, or a filter state?** → meta‑label →
  **UPPERCASE `tracking-wider`**. (`NOTICES`, `TABLE`, `STATUS`, `ARCHIVED`.)
- **Would it read naturally mid‑sentence?** → prose → **sentence case**.
- **Edge — a nav link that goes to a whole section** (not an action, a
  destination): UPPERCASE + chevron via `<UiViewLink>`. A nav link is the one
  "UPPERCASE thing you click."

## The one carve-out: compact "action chips"

There is a distinct, deliberate micro-idiom used inside workspace detail surfaces
(MeetingWorkspace, EventWorkspace, TimelineEventDetail, BlockComposer, …): a
**badge-sized tinted action chip** —
`h-6/h-7 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-{color}/10 text-{color}`
— for small inline contextual actions like `GENERATE AGENDA`, `START MEETING`,
`ASK EARNEST`, `PLAY RECORDING`.

These read as **clickable status pills**, not as buttons, and are kept
**UPPERCASE** on purpose — the small‑caps chip form is the whole point, and the
set is internally consistent. The Title‑Case rule above governs the three real
button **tiers** (`<Button>` / `<UiActionButton>`); it does not reach down into
this chip idiom.

Guidance: reach for a chip only when the action is genuinely secondary and
inline. If an action deserves a normal, prominent button, use a tier
(`<Button size="sm">` / `<UiActionButton>`) and Title Case — don't grow a chip
into a primary action.

## Component defaults (don't fight them)

- `<Button>` (shadcn) — pass **Title Case** slot text. It does not transform case.
- `<UiActionButton>` — T3 pill; pass **Title Case** slot text (`New Task`).
- `<UTabs>` — universal segmented pill; treat item `label` as a meta‑label. It is
  styled to read as UPPERCASE; write labels in Title Case in the items array and
  let the component present them (see existing usages — `Timeline`/`Table`).
- `<UiViewLink>` — UPPERCASE + chevron nav link; pass Title‑Case slot text, the
  component uppercases.
- Field labels — the app convention is `text-[10px] uppercase tracking-wider`
  (see [Label styling] in project memory). Write the source text in Title Case or
  UPPERCASE; the `uppercase` class normalizes it.

## Anti‑patterns (fix on sight)

- ❌ An action button with `class="… uppercase …"` (e.g. a caps `NEW TICKET` or
  `SAVE`). Remove the `uppercase`; it's an action → Title Case.
- ❌ A section/field/column label in Title Case with no `uppercase`. Add
  `uppercase tracking-wider`; it's a meta‑label.
- ❌ Mixing both inside one cluster (a Title‑Case toggle beside an UPPERCASE
  toggle). Toggle state labels are meta‑labels → both UPPERCASE.
- ❌ Reaching for `text-transform` in CSS to "fix" a one‑off. Change the source
  text case and use the shared classes so the intent is legible in the template.

## Related conventions (project memory)

- Button hierarchy — 3 tiers (T1 `<Button size="sm">`, T2 `variant="outline"`,
  T3 `<UiActionButton>`).
- Pill‑shape system — buttons/inputs/selects `rounded-full`.
- `<UTabs>` universal pill‑tab.
- Nav‑link style — UPPERCASE + chevron via `<UiViewLink>`; prose links sentence case.
- Label styling — `text-[10px] uppercase tracking-wider`.
