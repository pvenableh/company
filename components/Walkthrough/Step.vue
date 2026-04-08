<script setup lang="ts">
const props = defineProps<{
  target: string;
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  stepNumber: number;
  totalSteps: number;
}>();

const emit = defineEmits<{
  next: [];
  prev: [];
  skip: [];
}>();

const popoverRef = ref<HTMLElement | null>(null);
const targetRect = ref<DOMRect | null>(null);
const popoverStyle = ref<Record<string, string>>({});

const PAD = 8; // padding around spotlight

function updatePosition() {
  const el = document.querySelector(props.target);
  if (!el) return;

  // Scroll into view
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Wait for scroll to settle
  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    targetRect.value = rect;
    computePopoverPosition(rect);
  });
}

function computePopoverPosition(rect: DOMRect) {
  const placement = props.placement || 'bottom';
  const popoverWidth = 320;
  const popoverHeight = 180;
  const gap = 16;

  let top = 0;
  let left = 0;

  switch (placement) {
    case 'bottom':
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - popoverWidth / 2;
      break;
    case 'top':
      top = rect.top - popoverHeight - gap;
      left = rect.left + rect.width / 2 - popoverWidth / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      left = rect.left - popoverWidth - gap;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      left = rect.right + gap;
      break;
  }

  // Clamp to viewport
  left = Math.max(16, Math.min(left, window.innerWidth - popoverWidth - 16));
  top = Math.max(16, Math.min(top, window.innerHeight - popoverHeight - 16));

  popoverStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${popoverWidth}px`,
    zIndex: '10002',
  };
}

// Spotlight mask path (SVG with hole)
const maskPath = computed(() => {
  if (!targetRect.value) return '';
  const r = targetRect.value;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = r.left - PAD;
  const y = r.top - PAD;
  const w = r.width + PAD * 2;
  const h = r.height + PAD * 2;
  const radius = 12;

  // Outer rect (full viewport) + inner rounded rect (cutout)
  return `M0,0 H${vw} V${vh} H0 Z M${x + radius},${y} H${x + w - radius} Q${x + w},${y} ${x + w},${y + radius} V${y + h - radius} Q${x + w},${y + h} ${x + w - radius},${y + h} H${x + radius} Q${x},${y + h} ${x},${y + h - radius} V${y + radius} Q${x},${y} ${x + radius},${y} Z`;
});

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  nextTick(() => updatePosition());

  // Reposition on resize/scroll
  window.addEventListener('resize', updatePosition);
  window.addEventListener('scroll', updatePosition, true);

  // Watch for layout shifts
  const el = document.querySelector(props.target);
  if (el) {
    resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(el);
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', updatePosition);
  window.removeEventListener('scroll', updatePosition, true);
  resizeObserver?.disconnect();
});

// Re-position when step changes
watch(() => props.target, () => nextTick(() => updatePosition()));
</script>

<template>
  <Teleport to="body">
    <!-- Spotlight overlay -->
    <svg
      class="fixed inset-0 pointer-events-none"
      style="z-index: 10000; width: 100vw; height: 100vh;"
    >
      <path
        v-if="maskPath"
        :d="maskPath"
        fill="rgba(0,0,0,0.5)"
        fill-rule="evenodd"
        class="transition-all duration-300"
      />
    </svg>

    <!-- Click blocker (except on target) -->
    <div
      class="fixed inset-0"
      style="z-index: 10001;"
      @click.self="$emit('skip')"
    />

    <!-- Popover card -->
    <div
      ref="popoverRef"
      :style="popoverStyle"
      class="walkthrough-popover"
    >
      <div class="flex items-start justify-between gap-2 mb-2">
        <h3 class="text-sm font-semibold text-foreground">{{ title }}</h3>
        <button
          class="p-0.5 rounded-md hover:bg-muted/60 text-muted-foreground shrink-0"
          @click="$emit('skip')"
        >
          <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
        </button>
      </div>
      <p class="text-xs text-muted-foreground leading-relaxed mb-4">{{ description }}</p>

      <div class="flex items-center justify-between">
        <span class="text-[10px] text-muted-foreground/60">{{ stepNumber }} of {{ totalSteps }}</span>
        <div class="flex items-center gap-2">
          <button
            v-if="stepNumber > 1"
            class="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            @click="$emit('prev')"
          >
            Back
          </button>
          <button
            class="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
            @click="$emit('next')"
          >
            {{ stepNumber === totalSteps ? 'Done' : 'Next' }}
          </button>
        </div>
      </div>

      <!-- Progress dots -->
      <div class="flex items-center justify-center gap-1 mt-3">
        <div
          v-for="n in totalSteps"
          :key="n"
          class="h-1 rounded-full transition-all duration-200"
          :class="n === stepNumber ? 'w-4 bg-primary' : 'w-1 bg-muted-foreground/20'"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.walkthrough-popover {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border) / 0.5);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 8px 32px hsl(var(--foreground) / 0.12);
  animation: walkthrough-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes walkthrough-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
