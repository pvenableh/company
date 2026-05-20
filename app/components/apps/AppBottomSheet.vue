<!--
  AppBottomSheet — iOS-style bottom sheet modal.

  Drop-in replacement for centered UModals on touch-first surfaces:

  ```vue
  <AppBottomSheet v-model="open" title="New Plan">
    <form>…</form>
  </AppBottomSheet>
  ```

  Visuals match Apple's UISheetPresentationController:
    - Rounded-top corners (14px), backdrop dim 0 → 0.4.
    - Slides up from bottom with the iOS spring (Framework7 curve, 400ms)
      so it reads as part of the same nav family as our slide-over stack.
    - Grabber handle at top. Drag down on the grabber to dismiss; release
      below 100px or with downward velocity > 0.5 px/ms closes; otherwise
      springs back.
    - Max-height: 88vh, content scrolls when overflowing.

  Built on Reka-UI's DialogRoot so focus trap, Escape-to-close, and
  click-outside-to-close come for free.
-->
<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent } from 'reka-ui';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** Header title. Optional — pass empty to hide chrome. */
    title?: string;
    /** Header subtitle. */
    subtitle?: string;
    /** Hide the grabber bar (rare — title-only chrome). */
    hideGrabber?: boolean;
  }>(),
  { title: '', subtitle: '', hideGrabber: false },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

function close() {
  emit('update:modelValue', false);
}

const haptic = useHaptic();

// ── Drag-to-dismiss ──────────────────────────────────────────────
// The drag offset is in pixels; we translate the sheet by this amount
// during a drag. On release: > DISMISS_PX OR fast downward swipe →
// close; otherwise spring back to 0.
const sheetEl = useTemplateRef<HTMLElement>('sheetEl');
const dragY = ref(0);
const dragging = ref(false);

const DISMISS_PX = 100;
const DISMISS_VELOCITY = 0.5; // px / ms

let pointerStartY = 0;
let lastY = 0;
let lastT = 0;
let velocity = 0;
let activePointerId: number | null = null;

function onPointerDown(e: PointerEvent) {
  // Left mouse / primary touch only.
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  dragging.value = true;
  pointerStartY = e.clientY;
  lastY = e.clientY;
  lastT = performance.now();
  velocity = 0;
  activePointerId = e.pointerId;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== activePointerId) return;
  const delta = e.clientY - pointerStartY;
  // Only allow dragging the sheet DOWN — drag-up would have to compete
  // with the body scroll inside, and iOS doesn't move the sheet up
  // anyway in a single-detent layout.
  dragY.value = Math.max(0, delta);
  const now = performance.now();
  const dt = now - lastT;
  if (dt > 0) {
    velocity = (e.clientY - lastY) / dt;
  }
  lastY = e.clientY;
  lastT = now;
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== activePointerId) return;
  const shouldDismiss = dragY.value > DISMISS_PX || velocity > DISMISS_VELOCITY;
  dragging.value = false;
  activePointerId = null;
  try {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  } catch {
    /* releasePointerCapture throws if the pointer was never captured */
  }
  if (shouldDismiss) {
    // Reset the drag so the closing animation starts from translateY(0),
    // not from the dragged offset; the leave transition then slides it
    // down. (If we leave the inline transform in place, the leave
    // animation snaps instead of springs.)
    dragY.value = 0;
    haptic.detentSnap();
    close();
  } else if (dragY.value > 0) {
    // Snap-back from a partial drag — fire detent haptic so the user feels
    // the spring-back, but only when there was a real drag (not a tap).
    haptic.detentSnap();
    dragY.value = 0;
  } else {
    dragY.value = 0;
  }
}

// Live transform — disable transition while dragging so the sheet
// tracks the finger 1:1; re-enable on release for the spring-back.
const sheetStyle = computed(() => ({
  transform: dragY.value ? `translate3d(0, ${dragY.value}px, 0)` : undefined,
  transition: dragging.value ? 'none' : undefined,
}));

// Body scroll lock for non-touch (Reka-UI's DialogRoot already handles
// this on mobile, but pinning explicitly here avoids any double-mount
// weirdness with the slide-over stack also doing useScrollLock).
</script>

<template>
  <DialogRoot :open="modelValue" @update:open="(v) => $emit('update:modelValue', v)">
    <DialogPortal>
      <Transition name="bottom-sheet-backdrop">
        <DialogOverlay v-show="modelValue" class="app-bottom-sheet__backdrop" />
      </Transition>
      <Transition name="bottom-sheet">
        <DialogContent
          v-show="modelValue"
          ref="sheetEl"
          class="app-bottom-sheet"
          :class="{ 'app-bottom-sheet--dragging': dragging }"
          :style="sheetStyle"
          @escape-key-down="close"
          @pointer-down-outside="close"
        >
          <!-- Drag handle row. Captures the pointer; the rest of the
               sheet does NOT, so form fields work normally. -->
          <div
            v-if="!hideGrabber"
            class="app-bottom-sheet__handle-row"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          >
            <span class="app-bottom-sheet__grabber" aria-hidden="true" />
          </div>

          <!-- Optional title bar. -->
          <header v-if="title || subtitle || $slots.actions" class="app-bottom-sheet__header">
            <div class="min-w-0">
              <h2 v-if="title" class="app-bottom-sheet__title">{{ title }}</h2>
              <p v-if="subtitle" class="app-bottom-sheet__subtitle">{{ subtitle }}</p>
            </div>
            <div v-if="$slots.actions" class="app-bottom-sheet__actions">
              <slot name="actions" />
            </div>
          </header>

          <div class="app-bottom-sheet__body">
            <slot />
          </div>
        </DialogContent>
      </Transition>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-bottom-sheet__backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgb(0 0 0 / 0.4);
  pointer-events: auto;
}

.app-bottom-sheet {
  --ios-spring: cubic-bezier(0.36, 0.66, 0.04, 1);
  --ios-spring-duration: 400ms;
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 71;
  display: flex;
  flex-direction: column;
  max-height: 88vh;
  min-height: 30vh;
  background: hsl(var(--background));
  border-top-left-radius: 14px;
  border-top-right-radius: 14px;
  box-shadow: 0 -8px 24px -8px rgb(0 0 0 / 0.25);
  transform: translate3d(0, 0, 0);
  transition: transform var(--ios-spring-duration) var(--ios-spring);
  /* Centered max-width on desktop so the sheet doesn't span 2000px. */
  margin-inline: auto;
  max-width: 640px;
  inset-inline: 0;
  border: 1px solid hsl(var(--border) / 0.5);
  border-bottom: 0;
}

.app-bottom-sheet--dragging {
  transition: none;
}

.app-bottom-sheet__handle-row {
  display: flex;
  justify-content: center;
  padding: 8px 0 4px;
  cursor: grab;
  touch-action: none;
}

.app-bottom-sheet__handle-row:active {
  cursor: grabbing;
}

.app-bottom-sheet__grabber {
  display: block;
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: hsl(var(--muted-foreground) / 0.35);
}

.app-bottom-sheet__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 4px 1.25rem 12px;
  border-bottom: 1px solid hsl(var(--border) / 0.4);
}

.app-bottom-sheet__title {
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.2;
  color: hsl(var(--foreground));
}

.app-bottom-sheet__subtitle {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
}

.app-bottom-sheet__actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.app-bottom-sheet__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem 1.25rem 1.5rem;
  /* Honor the iOS home-bar inset on devices that report it. */
  padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}

/* ── Enter / leave transitions ── */

.bottom-sheet-backdrop-enter-active,
.bottom-sheet-backdrop-leave-active {
  transition: opacity var(--ios-spring-duration, 400ms) cubic-bezier(0.36, 0.66, 0.04, 1);
}

.bottom-sheet-backdrop-enter-from,
.bottom-sheet-backdrop-leave-to {
  opacity: 0;
}

.bottom-sheet-enter-active,
.bottom-sheet-leave-active {
  transition: transform var(--ios-spring-duration) var(--ios-spring);
}

.bottom-sheet-enter-from,
.bottom-sheet-leave-to {
  transform: translate3d(0, 100%, 0);
}
</style>
