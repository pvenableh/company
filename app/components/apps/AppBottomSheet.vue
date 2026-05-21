<!--
  AppBottomSheet — iOS-style bottom sheet, custom-built on Teleport + Vue
  reactivity + CSS transitions for enter/leave, and GSAP for the drag path.

  Why this stack? Reka-UI's Dialog Presence fought Vue's <Transition> and
  left sheets stuck at enter-from on first mount. Vue's own <Transition>
  uses a RAF callback to swap enter-from → enter-to, which can stall in
  HMR / headless / hidden-tab scenarios. Toggling an inline transform via
  reactive state side-steps both: the compositor drives the CSS transition
  from the render engine, no Presence wrapper, no class-swap RAF dance.
  GSAP earns its keep on the drag handler where the finger needs 1:1
  tracking and a hand-tuned spring-back.

  API (preserved from prior versions):
    <AppBottomSheet v-model="open" title="…" subtitle="…">
      <form>…</form>
      <template #actions>… header-right buttons …</template>
      <template #footer>… pinned action row …</template>
    </AppBottomSheet>

  Behaviour:
    - Rounded-top sheet (14px), backdrop dim 0 → 0.4 on the iOS spring.
    - Drag down on the grabber: > DISMISS_PX OR velocity > DISMISS_VELOCITY
      → closes; else springs back. Detent haptic on release of a real drag.
    - Max-height 88vh, body scrolls when overflowing, footer pins below.
    - Centered max-width 640px on desktop so it doesn't span 2000px wide.
    - Escape closes; click outside the sheet (on backdrop) closes.
    - body overflow locked while open.
-->
<script setup lang="ts">
import { gsap } from 'gsap';

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

const haptic = useHaptic();

const sheetEl = useTemplateRef<HTMLElement>('sheetEl');

const SPRING_EASE_FN = 'cubic-bezier(0.36, 0.66, 0.04, 1)';
const ENTER_MS = 400;
const LEAVE_MS = 320;

// `mounted` keeps the sheet in the DOM during the leave transition. `visible`
// drives the inline transform/opacity. We can't collapse them into one ref:
// the closed pose has to render at least one frame before flipping to the
// open pose, otherwise the browser sees both styles in one tick and skips
// the transition.
const mounted = ref(false);
const visible = ref(false);
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

async function openSheet() {
  if (leaveTimer) {
    clearTimeout(leaveTimer);
    leaveTimer = null;
  }
  mounted.value = true;
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKeydown);
  // Wait one frame so the closed pose paints first, then flip to open
  // — gives the CSS transition something to interpolate from. setTimeout
  // instead of requestAnimationFrame so this still kicks when RAF is
  // throttled (headless preview, background tabs).
  await nextTick();
  setTimeout(() => {
    visible.value = true;
  }, 16);
}

function closeSheet() {
  if (leaveTimer) {
    clearTimeout(leaveTimer);
    leaveTimer = null;
  }
  visible.value = false;
  leaveTimer = setTimeout(() => {
    mounted.value = false;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKeydown);
    dragY.value = 0;
    leaveTimer = null;
  }, LEAVE_MS);
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) openSheet();
    else if (mounted.value) closeSheet();
  },
);

onMounted(() => {
  if (props.modelValue) openSheet();
});

function close() {
  emit('update:modelValue', false);
}

function onBackdropClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('app-bottom-sheet__backdrop')) close();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}

onBeforeUnmount(() => {
  if (leaveTimer) clearTimeout(leaveTimer);
  document.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
});

// ── Drag-to-dismiss ──────────────────────────────────────────────
// The grabber row captures the pointer and tracks dY 1:1. dragY is
// applied to the sheet via the reactive inline style alongside the
// open-state transform; on release we spring back via GSAP or close
// the sheet.

const dragging = ref(false);
const dragY = ref(0);

const DISMISS_PX = 100;
const DISMISS_VELOCITY = 0.5; // px / ms
const SPRING_DURATION = 0.4;

let pointerStartY = 0;
let lastY = 0;
let lastT = 0;
let velocity = 0;
let activePointerId: number | null = null;

function onPointerDown(e: PointerEvent) {
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
  dragY.value = Math.max(0, delta);
  const now = performance.now();
  const dt = now - lastT;
  if (dt > 0) velocity = (e.clientY - lastY) / dt;
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
    /* throws if pointer was never captured */
  }
  if (shouldDismiss) {
    haptic.detentSnap();
    dragY.value = 0;
    close();
  } else if (dragY.value > 0) {
    haptic.detentSnap();
    // Spring dragY back to 0 — GSAP if available, fallback to direct set
    // so the snap-back still happens when the GSAP ticker is throttled.
    const start = dragY.value;
    const startT = performance.now();
    if (sheetEl.value) {
      gsap.to({ v: start }, {
        v: 0,
        duration: SPRING_DURATION,
        ease: SPRING_EASE_FN,
        onUpdate() {
          dragY.value = (this.targets()[0] as { v: number }).v;
        },
        onComplete() {
          dragY.value = 0;
        },
      });
      // Belt-and-suspenders: if GSAP doesn't tick (RAF throttled), make
      // sure dragY lands on 0 within the spring duration.
      setTimeout(() => {
        if (performance.now() - startT >= SPRING_DURATION * 1000) dragY.value = 0;
      }, SPRING_DURATION * 1000 + 16);
    } else {
      dragY.value = 0;
    }
  } else {
    dragY.value = 0;
  }
}

// Inline transform: dragY adds on top of the open/closed pose.
const sheetStyle = computed(() => ({
  transform: `translate3d(0, ${visible.value ? dragY.value : '100%'}${visible.value ? 'px' : ''}, 0)`,
  transition: dragging.value
    ? 'none'
    : `transform ${visible.value ? ENTER_MS : LEAVE_MS}ms ${SPRING_EASE_FN}`,
}));

const backdropStyle = computed(() => ({
  opacity: visible.value ? 1 : 0,
  transition: `opacity ${visible.value ? ENTER_MS : LEAVE_MS}ms ${SPRING_EASE_FN}`,
}));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="mounted"
      class="app-bottom-sheet__backdrop"
      :style="backdropStyle"
      @mousedown="onBackdropClick"
    />
    <div
      v-if="mounted"
      ref="sheetEl"
      class="app-bottom-sheet"
      :class="{ 'app-bottom-sheet--dragging': dragging }"
      :style="sheetStyle"
      role="dialog"
      aria-modal="true"
    >
      <!-- Drag handle row — captures the pointer; the rest of the sheet
           does NOT, so form fields work normally. -->
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

      <footer v-if="$slots.footer" class="app-bottom-sheet__footer">
        <slot name="footer" />
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-bottom-sheet__backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgb(0 0 0 / 0.4);
  pointer-events: auto;
  opacity: 0;
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
  margin-inline: auto;
  max-width: 640px;
  border: 1px solid hsl(var(--border) / 0.5);
  border-bottom: 0;
  will-change: transform;
  /* Closed pose — overridden by the reactive inline transform on open. */
  transform: translate3d(0, 100%, 0);
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
  padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}

.app-bottom-sheet:has(.app-bottom-sheet__footer) .app-bottom-sheet__body {
  padding-bottom: 1rem;
}

.app-bottom-sheet__footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  background: hsl(var(--background));
  border-top: 1px solid hsl(var(--border) / 0.4);
}
</style>
