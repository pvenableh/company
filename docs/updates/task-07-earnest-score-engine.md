# Task 7 — Earnest Score Engine

## Context
The `earnest_scores` and `earnest_history` collections exist in Directus with the correct field
names (verified against live schema). The Score page in the Companion app reads from
`earnest_scores`. What's missing is the server-side engine that populates these records when
events happen.

### Important: admin Directus client
The server-side admin client is `getTypedDirectus()` from `server/utils/directus.ts`.
It is auto-imported by Nuxt. There is no `getAdminDirectus()` function.

### Business model note (Section 08)
The Earnest Score is described as "the most important churn-reduction mechanism in the platform.
It makes switching feel like starting over." Scores are org-level — collective team performance.

## Step 1 — Read existing score data first

Before writing anything:
1. Read `types/directus.ts` — find `EarnestScore` and `EarnestHistory` interfaces fully
2. Read `server/api/score/` if it exists in the main platform
3. Read any existing composables that reference `earnest_scores`

Key fields confirmed from the schema:
```typescript
EarnestScore: {
  id, organization, total_ep, level, current_score, streak, best_streak,
  last_activity_date, dimension_scores (JSON), badges_unlocked (JSON),
  days_active_this_week, total_tasks_completed, projects_fully_completed,
  advance_schedule_count, consecutive_high_completion_days,
  consecutive_responsive_days, consecutive_top_rank_days
}

EarnestHistory: {
  id, organization, date (string), score, ep_earned, streak, dimensions (JSON)
}
```

## Step 2 — Create server/utils/earnestScore.ts

This utility is called by event handlers across the platform to award EP and update scores.

```typescript
// Earnest Score calculation and award engine.
// Called when platform events occur (ticket closed, invoice sent, message sent, etc.)

export type ScoreDimension = 'delivery' | 'communication' | 'finance' | 'growth' | 'consistency'

export interface EPAward {
  dimension: ScoreDimension
  ep: number
  reason: string
}

// EP values per event type
export const EP_AWARDS: Record<string, EPAward> = {
  ticket_closed:           { dimension: 'delivery',      ep: 10,  reason: 'Ticket resolved' },
  project_completed:       { dimension: 'delivery',      ep: 25,  reason: 'Project completed' },
  project_on_time:         { dimension: 'delivery',      ep: 15,  reason: 'Delivered on time' },
  message_sent:            { dimension: 'communication', ep: 2,   reason: 'Team message' },
  comment_posted:          { dimension: 'communication', ep: 2,   reason: 'Comment added' },
  invoice_sent:            { dimension: 'finance',       ep: 5,   reason: 'Invoice sent' },
  invoice_paid_on_time:    { dimension: 'finance',       ep: 15,  reason: 'Paid on time' },
  card_scan:               { dimension: 'growth',        ep: 5,   reason: 'CardDesk scan' },
  contact_added:           { dimension: 'growth',        ep: 10,  reason: 'Contact added to CRM' },
  deal_won:                { dimension: 'growth',        ep: 20,  reason: 'Deal won' },
  daily_login:             { dimension: 'consistency',   ep: 3,   reason: 'Daily login' },
  task_completed:          { dimension: 'consistency',   ep: 3,   reason: 'Task completed' },
}

// Level thresholds
const LEVEL_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000]

function calculateLevel(totalEp: number): number {
  let level = 1
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalEp >= LEVEL_THRESHOLDS[i]) level = i + 1
    else break
  }
  return level
}

/**
 * Award EP to a user's org score for an event.
 * Gets or creates the earnest_scores record for the org.
 * Updates dimension_scores and total_ep atomically.
 */
export async function awardEP(
  orgId: string,
  eventType: keyof typeof EP_AWARDS,
  userId?: string
): Promise<void> {
  const award = EP_AWARDS[eventType]
  if (!award) return

  const directus = getTypedDirectus()

  // Get or create the score record for this org
  let scoreRecords = await directus.request(
    readItems('earnest_scores', {
      filter: { organization: { _eq: orgId } },
      fields: ['id', 'total_ep', 'level', 'streak', 'best_streak',
               'last_activity_date', 'dimension_scores', 'badges_unlocked',
               'days_active_this_week'],
      limit: 1,
    })
  ) as any[]

  const today = new Date().toISOString().split('T')[0]
  
  if (scoreRecords.length === 0) {
    // Create initial score record
    await directus.request(
      createItem('earnest_scores', {
        organization: orgId,
        total_ep: award.ep,
        level: 1,
        streak: 1,
        best_streak: 1,
        last_activity_date: today,
        dimension_scores: { [award.dimension]: award.ep },
        badges_unlocked: {},
        days_active_this_week: 1,
      })
    )
    return
  }

  const score = scoreRecords[0]
  const dimensions = score.dimension_scores ?? {}
  const newDimensionScore = (dimensions[award.dimension] ?? 0) + award.ep
  const newTotalEp = (score.total_ep ?? 0) + award.ep
  const newLevel = calculateLevel(newTotalEp)

  // Streak logic
  const lastActive = score.last_activity_date
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  let newStreak = score.streak ?? 0
  let newBestStreak = score.best_streak ?? 0

  if (lastActive === today) {
    // Already active today — streak unchanged
  } else if (lastActive === yesterday) {
    // Consecutive day — increment streak
    newStreak = newStreak + 1
    newBestStreak = Math.max(newStreak, newBestStreak)
  } else if (lastActive < yesterday) {
    // Streak broken
    newStreak = 1
  }

  await directus.request(
    updateItem('earnest_scores', score.id, {
      total_ep: newTotalEp,
      level: newLevel,
      streak: newStreak,
      best_streak: newBestStreak,
      last_activity_date: today,
      dimension_scores: { ...dimensions, [award.dimension]: newDimensionScore },
    })
  )
}
```

## Step 3 — Wire awardEP() to platform events

Find the server routes that handle these events and add `awardEP()` calls. Read each route first.

| Event | Route to find | Call |
|-------|---------------|------|
| Ticket closed | `server/api/tickets/` status update | `awardEP(orgId, 'ticket_closed')` |
| Invoice sent | `server/api/invoices/` send/create | `awardEP(orgId, 'invoice_sent')` |
| Message sent | `server/api/channels/` message create | `awardEP(orgId, 'message_sent')` |
| Task completed | `server/api/tasks/` complete | `awardEP(orgId, 'task_completed')` |
| Contact added | `server/api/contacts/` or people create | `awardEP(orgId, 'contact_added')` |

The `awardEP()` call should be fire-and-forget — wrap in a try/catch and never let it block
the main response. Pattern:
```typescript
// After the main operation succeeds:
awardEP(orgId, 'ticket_closed').catch(err => 
  console.warn('[earnestScore] Failed to award EP:', err)
)
return { success: true, ... }
```

## Step 4 — Daily login streak endpoint

Create `server/api/score/checkin.post.ts`:
- Called when the user loads the app (once per day max)
- Awards `daily_login` EP
- Returns the updated score record

Call this from a client-side composable that runs once on app mount, guarded by
a daily localStorage flag so it only fires once per calendar day per user.

## Step 5 — Score page API

Create `server/api/score/me.get.ts` in the main platform (if it doesn't exist):
- Returns the current user's org's `earnest_scores` record
- Includes dimension_scores and badges_unlocked

Create `server/api/score/leaderboard.get.ts`:
- Returns top 20 `earnest_scores` records for the org, sorted by `total_ep` desc
- Joins with user data via `organizations_directus_users` or `org_memberships`

## Do NOT implement in this task
- Badge award logic (that's a follow-up task)
- The monthly Score Report email
- Score-based upsell prompts

## After making changes
Run `pnpm typecheck`. Test by completing a ticket and verifying the earnest_scores record
updates correctly. Check that streaks break properly when `last_activity_date` is more than
1 day ago.
