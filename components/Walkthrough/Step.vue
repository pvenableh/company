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
    <!-- Spotlight overlay with tinted dim -->
    <svg
      class="fixed inset-0 pointer-events-none"
      style="z-index: 10000; width: 100vw; height: 100vh;"
    >
      <defs>
        <!-- Glow filter for spotlight cutout -->
        <filter id="wt-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feFlood flood-color="#00bfff" flood-opacity="0.35" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        v-if="maskPath"
        :d="maskPath"
        fill="rgba(0, 18, 35, 0.55)"
        fill-rule="evenodd"
        filter="url(#wt-glow)"
        class="transition-all duration-300"
      />
    </svg>

    <!-- Click blocker -->
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
      <!-- Top accent bar -->
      <div class="walkthrough-accent" />

      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex items-center gap-2">
          <span class="w-5 h-5 rounded-md bg-[#00bfff]/15 flex items-center justify-center">
            <UIcon name="i-heroicons-light-bulb" class="w-3 h-3 text-[#00bfff]" />
          </span>
          <h3 class="text-sm font-semibold text-foreground">{{ title }}</h3>
        </div>
        <button
          class="p-0.5 rounded-md hover:bg-muted/60 text-muted-foreground shrink-0"
          @click="$emit('skip')"
        >
          <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
        </button>
      </div>
      <p class="text-xs text-muted-foreground leading-relaxed mb-4">{{ description }}</p>

      <div class="flex items-center justify-between">
        <span class="text-[10px] text-[#0093c6]/60 font-medium">{{ stepNumber }} / {{ totalSteps }}</span>
        <div class="flex items-center gap-2">
          <button
            v-if="stepNumber > 1"
            class="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            @click="$emit('prev')"
          >
            Back
          </button>
          <button
            class="walkthrough-next-btn"
            @click="$emit('next')"
          >
            {{ stepNumber === totalSteps ? 'Done' : 'Next' }}
            <UIcon v-if="stepNumber < totalSteps" name="i-heroicons-arrow-right" class="w-3 h-3" />
            <UIcon v-else name="i-heroicons-check" class="w-3 h-3" />
          </button>
        </div>
      </div>

      <!-- Progress dots -->
      <div class="flex items-center justify-center gap-1.5 mt-3">
        <div
          v-for="n in totalSteps"
          :key="n"
          class="h-1.5 rounded-full transition-all duration-300"
          :class="n === stepNumber ? 'w-5 bg-[#00bfff]' : n < stepNumber ? 'w-1.5 bg-[#00bfff]/40' : 'w-1.5 bg-muted-foreground/15'"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.walkthrough-popover {
  background: hsl(var(--card));
  border: 1px solid rgba(0, 191, 255, 0.2);
  border-radius: 16px;
  padding: 16px;
  padding-top: 20px;
  box-shadow:
    0 8px 32px rgba(0, 18, 35, 0.15),
    0 0 0 1px rgba(0, 191, 255, 0.08),
    0 0 24px rgba(0, 191, 255, 0.06);
  animation: walkthrough-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
  position: relative;
  overflow: hidden;
}

.walkthrough-accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #00bfff, #0093c6, #00bfff);
  background-size: 200% 100%;
  animation: walkthrough-shimmer 3s ease-in-out infinite;
}

.walkthrough-next-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #00bfff, #0093c6);
  padding: 5px 14px;
  border-radius: 10px;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 191, 255, 0.25);
}
.walkthrough-next-btn:hover {
  background: linear-gradient(135deg, #00ace7, #0078a1);
  box-shadow: 0 4px 12px rgba(0, 191, 255, 0.35);
  transform: translateY(-1px);
}

:is(.dark) .walkthrough-popover {
  border-color: rgba(0, 191, 255, 0.15);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(0, 191, 255, 0.1),
    0 0 32px rgba(0, 191, 255, 0.08);
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

@keyframes walkthrough-shimmer {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
</style>
