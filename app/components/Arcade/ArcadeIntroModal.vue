<script setup lang="ts">
/**
 * First-visit explainer for the Earnest Score / arcade layer.
 *
 * The scoring system (EP pops, quests, streaks, podium, levels, badges) ships
 * fully wired but with no user-facing explanation — people see "+10 EP" fly by
 * with no idea what it means. This 5-slide carousel closes that gap.
 *
 * Auto-opens the first time a user lands on /account?section=score (when
 * `directus_users.app_pref_arcade_intro_dismissed_at` is null). Re-openable
 * from the "i" badge next to the section heading via the `open()` method
 * exposed on the component instance.
 *
 * Dismissal stamp pattern mirrors the Studio intro — write any timestamp on
 * dismiss, no snooze semantics (the "i" badge is the manual re-entry point).
 *
 * Copy is accuracy-first (voice charter): every EP figure, quest target, tier
 * and level name below is pulled from the real mechanics —
 *   EP amounts     → composables/useArcadeAwards.ts / server/utils/earnestScore.ts
 *   quests         → composables/useArcadeQuests.ts
 *   tiers / levels → composables/useEarnestScore.ts
 *   dimensions     → components/Earnest/DimensionChart.vue (what's on screen)
 * Nothing here is invented — if a number changes there, change it here too.
 */
const { user } = useDirectusAuth()
const { updateMe } = useDirectusUsers()

const isOpen = ref(false)
const slide = ref(0)

interface IntroSlide {
  icon: string
  title: string
  body: string
  /** Optional labelled rows (EP tables, quest lists) rendered under the body. */
  rows?: { label: string; value: string }[]
}

const slides: IntroSlide[] = [
  {
    icon: 'lucide:flame',
    title: 'Meet your Earnest Score',
    body: 'Your Earnest Score is a 0–100 read on how your work is actually going — follow-through, consistency, and momentum in one number. It climbs from Kindling to Growing, Strong, and Exemplary as you ship work and stay on top of things. It rewards the real work, not busywork.',
  },
  {
    icon: 'lucide:zap',
    title: 'Earn EP for real work',
    body: 'Every completed action earns Earnest Points — those "+EP" pops you see. The amount tracks how much the action moves the needle:',
    rows: [
      { label: 'Complete a task', value: '+3' },
      { label: 'Close a ticket', value: '+10' },
      { label: 'Add a contact', value: '+10' },
      { label: 'Get paid on time', value: '+15' },
      { label: 'Win a deal', value: '+20' },
      { label: 'Ship a project', value: '+25' },
    ],
  },
  {
    icon: 'lucide:target',
    title: 'Quests & streaks',
    body: 'Quests pay a bonus for finishing a set of work — on top of the EP each action already earned. Show up on consecutive days to build a streak.',
    rows: [
      { label: 'Daily check-in — earn any EP today', value: '+15' },
      { label: 'Power day — 75 EP in a day', value: '+15' },
      { label: 'Consistency — active 5 days this week', value: '+40' },
      { label: 'Weekly grind — 300 EP this week', value: '+40' },
      { label: 'Momentum — reach a 7-day streak', value: '+40' },
    ],
  },
  {
    icon: 'lucide:trophy',
    title: 'The podium',
    body: 'Your org shares a leaderboard. The podium ranks teammates by total EP, so you can see where you stand and who\'s on a tear this week. It\'s a friendly nudge, not a ranking that decides anything.',
  },
  {
    icon: 'lucide:award',
    title: 'Levels, badges & dimensions',
    body: 'As EP adds up you climb levels — Spark, Steady, Intentional, on up to Cornerstone. Badges mark milestones like your first deal or a 7-day streak. And six dimensions — Follow-Through, CRM, Consistency, Responsive, Proactivity, and Depth — show where you\'re strong and where there\'s room to grow.',
  },
]

const isLast = computed(() => slide.value === slides.length - 1)

function next() {
  if (isLast.value) {
    dismiss()
  } else {
    slide.value += 1
  }
}

function prev() {
  if (slide.value > 0) slide.value -= 1
}

async function dismiss() {
  isOpen.value = false
  // Reset to slide 0 so the next re-open from the "i" badge starts fresh.
  setTimeout(() => { slide.value = 0 }, 200)
  if (!user.value?.id) return
  try {
    await updateMe({ app_pref_arcade_intro_dismissed_at: new Date().toISOString() } as any)
  } catch (err) {
    console.warn('[ArcadeIntroModal] dismissal patch failed:', err)
  }
}

function open() {
  slide.value = 0
  isOpen.value = true
}

defineExpose({ open })

onMounted(() => {
  // Auto-open on first visit. Defer one tick so the user record is hydrated.
  nextTick(() => {
    const stored = (user.value as any)?.app_pref_arcade_intro_dismissed_at
    if (!stored) isOpen.value = true
  })
})
</script>

<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-md' }">
    <div class="intro-shell">
      <div class="intro-icon">
        <Icon :name="slides[slide]!.icon" class="w-7 h-7 text-white" />
      </div>

      <div class="intro-progress">
        <span
          v-for="(_, i) in slides"
          :key="i"
          class="intro-dot"
          :class="{ 'intro-dot--active': i === slide }"
        />
      </div>

      <h2 class="intro-title">{{ slides[slide]!.title }}</h2>
      <p class="intro-body">{{ slides[slide]!.body }}</p>

      <dl v-if="slides[slide]!.rows" class="intro-rows">
        <div v-for="row in slides[slide]!.rows" :key="row.label" class="intro-row">
          <dt class="intro-row__label">{{ row.label }}</dt>
          <dd class="intro-row__value">{{ row.value }}<span class="intro-row__ep"> EP</span></dd>
        </div>
      </dl>

      <div class="intro-actions">
        <UiActionButton v-if="slide > 0" icon="lucide:arrow-left" @click="prev">
          Back
        </UiActionButton>
        <button v-else type="button" class="intro-skip" @click="dismiss">Skip</button>
        <UiActionButton
          :icon="isLast ? 'lucide:check' : 'lucide:arrow-right'"
          variant="primary"
          @click="next"
        >
          {{ isLast ? "Got it" : 'Next' }}
        </UiActionButton>
      </div>
    </div>
  </UModal>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.intro-shell {
  @apply p-6 flex flex-col items-center text-center gap-3;
}

.intro-icon {
  @apply w-14 h-14 rounded-2xl flex items-center justify-center mb-1;
  background: linear-gradient(135deg, hsl(38 92% 50% / 0.95), hsl(330 81% 60% / 0.95));
  box-shadow: 0 6px 20px -8px hsl(0 72% 51% / 0.55);
}

.intro-progress {
  @apply flex items-center justify-center gap-1.5 mb-1;
}

.intro-dot {
  @apply w-1.5 h-1.5 rounded-full bg-muted transition-all;
}

.intro-dot--active {
  @apply bg-primary w-6;
}

.intro-title {
  @apply text-lg font-semibold text-foreground tracking-tight;
}

.intro-body {
  @apply text-sm text-muted-foreground leading-relaxed max-w-sm;
}

.intro-rows {
  @apply w-full max-w-sm mt-1 space-y-1;
}

.intro-row {
  @apply flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-1.5;
}

.intro-row__label {
  @apply text-xs text-foreground/80 text-left;
}

.intro-row__value {
  @apply text-sm font-semibold tabular-nums text-foreground shrink-0;
}

.intro-row__ep {
  @apply text-[10px] font-medium uppercase tracking-wider text-muted-foreground;
}

.intro-actions {
  @apply flex items-center justify-between w-full pt-4 gap-2;
}

.intro-skip {
  @apply text-xs text-muted-foreground hover:text-foreground transition-colors px-2;
}
</style>
