<script setup lang="ts">
/**
 * First-visit intro for the Content Studio plan editor.
 *
 * 4-slide carousel that auto-opens on the first visit to /social/plans/[id]
 * (when `directus_users.app_pref_studio_intro_dismissed_at` is null).
 * Re-openable from the "i" badge in the plan editor header via the
 * `open()` method exposed on the component instance.
 *
 * Dismissal stamp pattern mirrors CardDesk's promo banner — write any
 * timestamp on dismiss, no snooze semantics (the "i" badge is the manual
 * re-entry point).
 */
const { user } = useDirectusAuth()
const { updateMe } = useDirectusUsers()

const isOpen = ref(false)
const slide = ref(0)

const slides = [
  {
    icon: 'lucide:compass',
    title: 'This is your monthly content plan',
    body: 'One plan bundles a strategy + a month of posts under a single review link. The client signs off in one place — no per-post back-and-forth.',
  },
  {
    icon: 'lucide:plus-circle',
    title: 'Add posts inline',
    body: 'Use the row at the bottom of the posts list to drop in a caption, type, and schedule. Cover images, Figma frames, and platforms come from the per-post detail.',
  },
  {
    icon: 'lucide:layout-grid',
    title: 'See the wall fill out',
    body: 'The Instagram preview on the right shows how the planned month will sit on the grid. Tap a tile to scroll straight to that post.',
  },
  {
    icon: 'lucide:send',
    title: 'Share for review',
    body: 'When the plan is ready, click "Send for Review". You get a copyable link to send to the client — they review and approve everything in one go.',
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
    await updateMe({ app_pref_studio_intro_dismissed_at: new Date().toISOString() } as any)
  } catch (err) {
    console.warn('[StudioIntroModal] dismissal patch failed:', err)
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
    const stored = (user.value as any)?.app_pref_studio_intro_dismissed_at
    if (!stored) isOpen.value = true
  })
})
</script>

<template>
  <EModal v-model="isOpen" :ui="{ width: 'sm:max-w-md' }">
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
          {{ isLast ? "Let's go" : 'Next' }}
        </UiActionButton>
      </div>
    </div>
  </EModal>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.intro-shell {
  @apply p-6 flex flex-col items-center text-center gap-3;
}

.intro-icon {
  @apply w-14 h-14 rounded-2xl flex items-center justify-center mb-1;
  background: linear-gradient(135deg, hsl(220 60% 56% / 0.95), hsl(280 60% 56% / 0.95));
  box-shadow: 0 6px 20px -8px hsl(260 60% 56% / 0.55);
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

.intro-actions {
  @apply flex items-center justify-between w-full pt-4 gap-2;
}

.intro-skip {
  @apply text-xs text-muted-foreground hover:text-foreground transition-colors px-2;
}
</style>
