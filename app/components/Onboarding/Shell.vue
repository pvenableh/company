<script setup lang="ts">
import type { EarnestMood } from '~/composables/useEarnestPresence'

// ── Shared onboarding chrome ────────────────────────────────────────────────
// One frame for the whole signup journey: the living Earnest aura behind a
// glass card, a progress rail that spans register → org wizard, an Earnest
// presence (the morphing "E") heading every step, and a slot for the step
// body + footer nav. Both `/register` (step 1) and `/organization/new`
// (steps 2…N) render inside this so the flow reads as one continuous thing.
//
// Consumers set `layout: false` and own no chrome of their own — this is it.

const props = withDefaults(defineProps<{
  /** Absolute step index across the whole journey (1-based). */
  step: number
  /** Total steps across the whole journey. */
  total: number
  /** Drives the aura's colour/motion. Onboarding leans warm + present. */
  mood?: EarnestMood
  /** Small uppercase kicker above the title. */
  eyebrow?: string
  title?: string
  subtitle?: string
  /** Earnest's contextual aside, shown beside the mark. */
  line?: string
  /** Keys the step transition; defaults to `step`. */
  stepKey?: string | number
  markSize?: number
  showMark?: boolean
}>(), {
  mood: 'warm',
  showMark: true,
  markSize: 46,
})

const markRef = ref<{ react: (g: string) => void } | null>(null)

// Proxy the mark's gesture API so callers (Phase 2 reactions) can do
// shell.react('check') on a step advance, etc.
function react(gesture: string) {
  markRef.value?.react?.(gesture)
}
defineExpose({ react })

const railKey = computed(() => `${props.step}/${props.total}`)
</script>

<template>
  <div class="ob-root">
    <!-- Ambient living presence behind everything -->
    <div class="ob-aura">
      <EarnestAura :mood="mood" />
    </div>

    <div class="ob-stage">
      <NuxtLink to="/" class="ob-brand" aria-label="Earnest home">
        <LogoEarnest size="md" />
      </NuxtLink>

      <div class="ob-card ios-card">
        <!-- Progress rail (spans the whole journey) -->
        <div class="ob-rail" :key="railKey">
          <span
            v-for="s in total"
            :key="s"
            class="ob-rail__seg"
            :class="s <= step ? 'ob-rail__seg--on' : ''"
          />
        </div>

        <!-- Earnest presence + step heading -->
        <div v-if="showMark || title || eyebrow || subtitle" class="ob-head">
          <div v-if="showMark" class="ob-mark">
            <EarnestMark ref="markRef" :size="markSize" />
          </div>
          <p v-if="eyebrow" class="ob-eyebrow">{{ eyebrow }}</p>
          <h1 v-if="title" class="ob-title">{{ title }}</h1>
          <p v-if="subtitle" class="ob-subtitle">{{ subtitle }}</p>
          <p v-if="line" class="ob-line">{{ line }}</p>
        </div>

        <!-- Step body -->
        <Transition name="ob-step" mode="out-in">
          <div :key="stepKey ?? step" class="ob-body">
            <slot />
          </div>
        </Transition>

        <!-- Footer nav -->
        <div v-if="$slots.footer" class="ob-foot">
          <slot name="footer" />
        </div>
      </div>

      <p class="ob-steplabel">Step {{ step }} of {{ total }}</p>

      <div v-if="$slots.aside" class="ob-aside">
        <slot name="aside" />
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.ob-root {
  position: relative;
  min-height: 100svh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2.5rem 1rem;
  overflow: hidden;
}

/* The aura fills the viewport behind the card; its own dark veil keeps the
   card legible. Sits below all content. */
.ob-aura {
  position: fixed;
  inset: 0;
  z-index: 0;
  opacity: 0.9;
  pointer-events: none;
}

.ob-stage {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 36rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.ob-brand {
  display: inline-flex;
  opacity: 0.9;
  transition: opacity 200ms cubic-bezier(0.36, 0.66, 0.04, 1);
}
.ob-brand:hover { opacity: 1; }

.ob-card {
  width: 100%;
  padding: 2rem;
}

/* ── Progress rail ── */
.ob-rail {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-bottom: 1.75rem;
}
.ob-rail__seg {
  flex: 1;
  height: 4px;
  border-radius: 9999px;
  background: hsl(var(--muted) / 0.5);
  transition: background-color 500ms cubic-bezier(0.36, 0.66, 0.04, 1);
}
.ob-rail__seg--on {
  background: var(--cyan);
}

/* ── Presence + heading ── */
.ob-head {
  text-align: center;
  margin-bottom: 1.75rem;
}
.ob-mark {
  display: flex;
  justify-content: center;
  margin-bottom: 0.75rem;
}
.ob-eyebrow {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  margin-bottom: 0.375rem;
}
.ob-title {
  font-size: 1.25rem;
  line-height: 1.25;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.ob-subtitle {
  font-size: 0.875rem;
  color: hsl(var(--muted-foreground));
  margin-top: 0.375rem;
}
.ob-line {
  font-size: 0.8125rem;
  font-style: italic;
  color: hsl(var(--muted-foreground));
  margin-top: 0.625rem;
}

.ob-foot {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid hsl(var(--border) / 0.3);
}

.ob-steplabel {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: hsl(var(--muted-foreground) / 0.5);
}

.ob-aside {
  width: 100%;
  text-align: center;
}

/* ── Step transition (iOS curve: fade + lift + hair of scale) ── */
.ob-step-enter-active,
.ob-step-leave-active {
  transition: opacity 240ms cubic-bezier(0.36, 0.66, 0.04, 1),
    transform 240ms cubic-bezier(0.36, 0.66, 0.04, 1);
}
.ob-step-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.99);
}
.ob-step-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .ob-step-enter-active,
  .ob-step-leave-active { transition: opacity 160ms linear; }
  .ob-step-enter-from,
  .ob-step-leave-to { transform: none; }
}
</style>
