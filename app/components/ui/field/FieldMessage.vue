<script setup lang="ts">
/**
 * Validation message for a form field.
 *
 * Takes up NO space until there is a message, then pushes the content below
 * it as it appears. The push is animated (the slot is a 1-row grid going
 * 0fr → 1fr) so it opens smoothly instead of snapping.
 *
 * An earlier version reserved a permanent line of space so the layout never
 * shifted; it was reverted because forms with nothing invalid — the normal
 * case — read far too open.
 *
 * The element stays MOUNTED and animates off a `data-show` attribute rather
 * than `<Transition>` — an unmounted node can't animate out, and the repo's
 * motion policy is CSS transitions driven by reactive state.
 *
 * `held` keeps the last non-empty message so the exit animation still has
 * text to fade; without it the copy would vanish instantly while the box
 * faded. `aria-hidden` is toggled so the retained text isn't announced once
 * the error is resolved.
 */
import type { HTMLAttributes } from "vue"
import { computed, ref, watch } from "vue"
import { cn } from '~/lib/utils'

const props = defineProps<{
  /** Current message. Falsy = no error. */
  message?: string | null
  class?: HTMLAttributes["class"]
}>()

const held = ref(props.message ?? '')
watch(
  () => props.message,
  (m) => { if (m) held.value = m },
)

const shown = computed(() => Boolean(props.message))
</script>

<template>
  <div class="field-error-slot" :data-show="shown">
    <p
      data-slot="field-message"
      class="field-error text-xs text-destructive"
      :class="cn(props.class)"
      :aria-hidden="!shown"
      role="alert"
    >
      {{ held }}
    </p>
  </div>
</template>
