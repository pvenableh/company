# Task 4 — Implement planAllows() and Live Token Meter

## Part A — Add planAllows() to useOrgRole.ts

### Context
Read `composables/useOrgRole.ts` in full first. There is **no existing** `planAllows()` function
— it needs to be created from scratch and added to the composable's return object.

The composable currently returns role-based checks (`canAccess`, `hasPermission`, etc.) and uses
`useOrganization()` for `selectedOrg`. You'll need to also fetch the org's `plan` field.

### Business model alignment — CRITICAL

The business model (earnest-business-model-v3.docx, Section 03) is explicit:

> "Every plan gets all features. Customers are differentiated by how many people use the
> platform, how much AI they consume, and how many cards they scan."

Therefore `planAllows()` should **NOT** gate features by plan tier. The only exceptions
documented in the business model are:
- **White-label** — Agency plan only
- **Free tier** — exists as a fallback when no subscription is active; still gets all features
  but with zero AI tokens and zero scan credits (enforced by Task 3, not by feature gating)

### What to implement

```typescript
// Plan hierarchy for limit checks (not feature gating)
const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  starter: 1,  // maps to 'solo' Earnest plan
  pro: 2,      // maps to 'studio' Earnest plan
  enterprise: 3, // maps to 'agency' Earnest plan
}

// Only features that are truly plan-restricted (not resource-limited)
const PLAN_GATED_FEATURES: Record<string, string> = {
  white_label: 'enterprise',  // Agency only per business model
}

/**
 * Check if the org's plan allows a specific feature.
 * Per business model: all features are available on all paid plans.
 * Only white-label is gated to agency/enterprise tier.
 * Resource limits (tokens, scans, seats) are enforced server-side, not here.
 */
function planAllows(feature: string): boolean {
  // Need access to org plan — get from the org object
  const orgPlan = orgData.value?.plan ?? 'free'
  const requiredPlan = PLAN_GATED_FEATURES[feature]
  if (!requiredPlan) return true // Not gated = allowed on all plans
  const orgLevel = PLAN_HIERARCHY[orgPlan] ?? 0
  const requiredLevel = PLAN_HIERARCHY[requiredPlan] ?? 0
  return orgLevel >= requiredLevel
}
```

### Getting the org's plan field

`useOrgRole.ts` already has access to `selectedOrg` (the org ID) via `useOrganization()`. You
need the org's `plan` field. Either:
1. Extend the existing `fetchMembership()` to also read the org's plan, or
2. Add a separate `orgData` ref that fetches `organizations` fields when `selectedOrg` changes

Match whichever pattern introduces the least complexity. The org record is likely already
fetched elsewhere in the composable chain — check `useOrganization()` first.

### Add to the return object

```typescript
return {
  // ... existing returns ...
  planAllows,
}
```

### Search for existing call sites

Run `grep -r "planAllows" --include='*.ts' --include='*.vue'` to find any existing references.
If none exist yet, that's expected — the function is new. But CLAUDE.md mentions it as part of
the `useOrgRole()` API, so other tasks may reference it.

---

## Part B — Live Token Meter Component

### Context
`composables/useAITokens.ts` already computes `checkTokenBudget` with `remaining`, `canUse`,
and `reason`. `usageSummary` has `orgTokensUsed`, `orgBalance`, `orgLimit`.

### Business model requirement (Section 05 — non-negotiable)

The business model specifies:
- Always-visible progress bar in main dashboard and Companion PWA home screen
- Color: green → amber at 70% → red at 90%
- Each AI feature shows its token cost before the user triggers it
- At 80%: in-app banner
- At 90%: push notification (deferred — no push infra yet)
- Refill purchase is self-serve via Stripe — instant

### Create components/Organization/TokenMeter.vue

Read `composables/useAITokens.ts` fully before writing this component.
Look at existing components in `components/Organization/` (AITokenManagement.vue, AIUsage.vue)
to match the file and style patterns.
Use shadcn-vue components from `components/ui/`. Use `t-*` CSS classes for all colors.

The component needs two display modes controlled by a `compact` prop (boolean, default false):

**Compact mode** (for nav sidebar):
- Single progress bar, colored by usage level
- Percentage text: "73% used"
- Clicking opens the full billing page

**Full mode** (for account/billing page):
- Progress bar with color
- Three stat rows: Monthly allocation / Purchased tokens / Used this month
- CTA button when at 80%+: "Buy More Tokens"
- Disabled state message when at 100%

**Color logic:**
```
0–69%:  green (use t-text-success / success color variables)
70–89%: amber (use t-text-warning)
90–100%: red (use t-text-destructive)
```

**Props:**
```typescript
defineProps<{
  compact?: boolean
  showCta?: boolean // show "Buy More Tokens" button, default true
}>()
```

**Emits:**
```typescript
defineEmits<{
  topup: [] // emitted when Buy More Tokens is clicked
}>()
```

### Add TokenMeter to the nav

Read `components/Layout/Sidebar.vue` to find the right insertion point.
Add `<TokenMeter compact />` near the bottom of the nav, above the user avatar/footer.
Only show it when `checkTokenBudget.remaining !== null` (i.e., when the org has a limit set).

### Wire the topup emit

When `topup` is emitted from TokenMeter, navigate to `/account/billing` or open the existing
token purchase modal — match whatever pattern the existing token purchase flow uses.
Search for `stripe/tokens/checkout` to find where top-ups are currently triggered.

## After making changes
Run `pnpm typecheck`. Test with an org that has `ai_token_balance` set to various values to
confirm the color states work correctly.
