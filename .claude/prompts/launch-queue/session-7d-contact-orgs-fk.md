# Session 7d — `Contact.organizations` M2M → FK

**Status:** Not started (low priority)
**Blocker:** post-launch; **only revisit if partner-activation flow develops UX friction**
**Ships:** schema migration from many-to-many to FK for `Contact.organizations` + backfill + data-fetch updates

## Prompt

Tier 2 unification item H — flip `Contact.organizations` from M2M to FK.

Context: this was originally part of the Contacts & Leads unification memo. In 2026-04-22's Partner Activation ship, we chose the opposite direction — kept the M2M but activated the dormant partner concept via a new `contact_connections` collection with inheritance walks. That closed most of the UX pain this migration was meant to solve. The M2M-to-FK flip is still technically on the table but has **no real pain** currently driving it.

**Only run this session if** partner activation is in prod and you've observed specific UX friction — e.g. contact counts that should reflect a single-employer model but confuse users with multi-org membership, or reporting queries that have to join through the M2M junction table.

### Steps (if you decide to proceed)

1. **Confirm motivation.** Write down what UX friction you observed. If you can't name it specifically, **close this session without changes** and re-add to the queue only when friction is real.
2. **Migration design.**
   - Pick the "primary" org for each contact with multiple: most recent, most engagement, or manual audit.
   - Add `contacts.primary_organization` FK.
   - Backfill.
   - Dual-write period: fill both M2M + FK for N days.
   - Cut reads over to FK.
   - Drop M2M.
3. **Downstream updates.** Grep every query against `contacts.organizations` — update each to FK.

### DoD

- If proceeding: FK in place, M2M dropped, no broken queries.
- If declining: close this session file, note decline reason in commit message.

## Notes for Claude

- **Default disposition is decline** — only ship if the user explicitly identifies friction.
- The Partner Activation collection is `contact_connections` (per memory `project_partner_activation.md`) — the flip should coexist with it, not replace it.
- Sub-brand inheritance walk runs on both Contacts tab and Partners tab of `/clients/[id]` — if you do the flip, verify the inheritance still works.
