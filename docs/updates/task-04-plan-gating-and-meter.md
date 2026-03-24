# Task 4 — Implement planAllows() and Live Token Meter

## Part A — Implement planAllows() in useOrgRole.ts

### Context
Read `composables/useOrgRole.ts` in full first. Find the `planAllows()` function — it currently
returns `true` for everything. This needs real logic based on `organizations.plan`.

### What to implement

```typescript
// Map features to minimum required plan
const PLAN_FEATURE_MAP: Record<string, ('free'|'starter'|'pro'|'enterprise')[]> = {
  // Free tier — basic operations only
  projects:         ['free', 'starter', 'pro', 'enterprise'],
  tickets:          ['free', 'starter', 'pro', 'enterprise'],
  invoices:         ['free', 'starter', 'pro', 'enterprise'],

  // Solo/Starter and above
  crm:              ['starter', 'pro', 'enterprise'],
  contacts:         ['starter', 'pro', 'enterprise'],
  ai:               ['starter', 'pro', 'enterprise'],
  tasks:            ['starter', 'pro', 'enterprise'],
  expenses:         ['starter', 'pro', 'enterprise'],
  scheduler:        ['starter', 'pro', 'enterprise'],

  // Studio/Pro and above
  social:           ['pro', 'enterprise'],
  email_marketing:  ['pro', 'enterprise'],
  channels:         ['pro', 'enterprise'],
  team:             ['pro', 'enterprise'],
  marketing:        ['pro', 'enterprise'],
  command_center:   ['pro', 'enterprise'],

  // Agency/Enterprise only
  white_label:      ['enterprise'],
  advanced_ai:      ['enterprise'],
}

export function planAllows(feature: string): boolean {
  const org = selectedOrg.value // however the org object is accessed in useOrgRole
  const plan = org?.plan ?? 'free'
  const allowedPlans = PLAN_FEATURE_MAP[feature]
  if (!allowedPlans) return true // Unknown features default to allowed
  return allowedPlans.includes(plan as any)
}
```

Match the exact variable names and access patterns already used in `useOrgRole.ts`. Do not
change the function signature — only the implementation body.

### Where planAllows() is called
Do a project-wide search for `planAllows(` to find all existing call sites. Make sure none
of them break — the function signature must stay the same (string → boolean).

---

## Part B — Live Token Meter Component

### Context
`composables/useAITokens.ts` already computes `checkTokenBudget` with `remaining`, `canUse`,
and `reason`. `usageSummary` has `orgTokensUsed`, `orgBalance`, `orgLimit`.

### Create components/Organization/TokenMeter.vue

Read `composables/useAITokens.ts` fully before writing this component.
Look at existing components in `components/Organization/` to match the file and style patterns.
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

Read `components/Layout/` (or wherever the sidebar/nav lives) to find the right insertion point.
Add `<TokenMeter compact />` near the bottom of the nav, above the user avatar/footer.
Only show it when `checkTokenBudget.remaining !== null` (i.e., when the org has a limit set).

### Wire the topup emit

When `topup` is emitted from TokenMeter, navigate to `/account/billing` or open the existing
token purchase modal — match whatever pattern the existing token purchase flow uses.
Search for `stripe/tokens/checkout` to find where top-ups are currently triggered.

## After making changes
Run `pnpm typecheck`. Test with an org that has `ai_token_balance` set to various values to
confirm the color states work correctly.
