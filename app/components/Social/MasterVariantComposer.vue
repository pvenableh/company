<!--
  MasterVariantComposer — caption surface for the Composition Canvas (P2).

  Replaces the single-caption textarea with a master draft + per-channel
  variant lanes. Editing a channel lane forks the variant from master;
  in-sync channels publish the master verbatim.

  Visual language
    • Master chip (leftmost) — solid pill, accent ring when active.
    • In-sync channel chip — gold filament border that breathes (3.6s).
      Communicates "this channel will publish the master".
    • Forked channel chip — channel-hue background + breathing divergence
      ribbon. Communicates "this channel has its own copy".
    • Lane swap — opacity + 6px Y translate, single shared spring 400ms.
    • prefers-reduced-motion kills all breathing; static borders remain.

  Why a single textarea (not five stacked):
    Reduces visual noise and matches the principle that a single canvas
    edits one thing at a time. The chip row is the affordance for "I want
    to fork this channel". A draft is rarely diverged across all channels.

  Two-way bindings (paired props/emits — usable with `v-model:caption` /
  `v-model:variants`):
    :caption           v-model:caption        master draft string
    :variants          v-model:variants       Partial<Record<Platform,string>>

  Other props:
    :platforms         SocialPlatform[]       which chips to render
    :cta-url           string                 (used only for the char-count
                                              footnote that warns the
                                              published suffix counts too)
    :cta-label         string

  Emits:
    update:caption     (next: string)
    update:variants    (next: Partial<Record>)
    request-trim       (platform: SocialPlatform | 'master')
                       — let parent run the AI seam-fix
-->
<script setup lang="ts">
import type { SocialPlatform } from '~~/shared/social';
import { getSocialPlatformIcon, getSocialPlatformLabel } from '~/utils/icons';

const props = defineProps<{
  caption: string;
  variants: Partial<Record<SocialPlatform, string>>;
  platforms: SocialPlatform[];
  ctaUrl?: string;
  ctaLabel?: string;
  /** Disable the trim affordance when the parent has no AI endpoint wired
   *  yet. Defaults to enabled. */
  enableTrim?: boolean;
  /** Parent is generating a draft — drives the "Drafting…" state on the
   *  inline "Draft with Earnest" button. */
  drafting?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:caption', value: string): void;
  (e: 'update:variants', value: Partial<Record<SocialPlatform, string>>): void;
  (e: 'request-trim', lane: SocialPlatform | 'master'): void;
  (e: 'request-draft', brief: string): void;
}>();

type Lane = 'master' | SocialPlatform;
const activeLane = ref<Lane>('master');

// Drop activeLane back to master if the user deselects the lane's channel.
watch(
  () => props.platforms,
  (list) => {
    if (activeLane.value !== 'master' && !list.includes(activeLane.value as SocialPlatform)) {
      activeLane.value = 'master';
    }
  },
);

// Per-platform character limits (the most restrictive value each API will
// accept). 4000 acts as a "no practical cap" for Facebook.
const PLATFORM_LIMIT: Record<SocialPlatform, number> = {
  instagram: 2200,
  linkedin: 3000,
  tiktok: 4000,
  threads: 500,
  facebook: 4000,
};

// Channel hue table mirrors the river's leaf tints so the chip row and the
// timeline read as the same vocabulary.
const PLATFORM_HUE: Record<SocialPlatform, number> = {
  instagram: 330,
  tiktok: 188,
  linkedin: 210,
  threads: 0,
  facebook: 232,
};

function platformIcon(p: SocialPlatform) {
  return getSocialPlatformIcon(p);
}
function platformLabel(p: SocialPlatform) {
  return getSocialPlatformLabel(p);
}
function isForked(p: SocialPlatform) {
  const v = props.variants?.[p];
  return typeof v === 'string';
}

// Active text — master OR active variant. Setter forks the variant on first
// edit, then keeps editing it. Empty edits stay forked until the user hits
// Resync (matches the file-edit metaphor — clearing the buffer isn't the
// same as deleting the file).
const activeText = computed<string>({
  get() {
    if (activeLane.value === 'master') return props.caption;
    const v = props.variants?.[activeLane.value as SocialPlatform];
    return typeof v === 'string' ? v : props.caption;
  },
  set(value: string) {
    if (activeLane.value === 'master') {
      emit('update:caption', value);
      return;
    }
    const next: Partial<Record<SocialPlatform, string>> = { ...(props.variants || {}) };
    next[activeLane.value as SocialPlatform] = value;
    emit('update:variants', next);
  },
});

function resyncActiveLane() {
  if (activeLane.value === 'master') return;
  const next: Partial<Record<SocialPlatform, string>> = { ...(props.variants || {}) };
  delete next[activeLane.value as SocialPlatform];
  emit('update:variants', next);
}

// Char counting — the master shows the smallest selected-platform cap so
// it's safe everywhere; a per-platform lane shows its own cap.
const activeLimit = computed(() => {
  if (activeLane.value === 'master') {
    if (props.platforms.length === 0) return 4000;
    return Math.min(...props.platforms.map((p) => PLATFORM_LIMIT[p]));
  }
  return PLATFORM_LIMIT[activeLane.value as SocialPlatform];
});

// The published body includes the optional CTA suffix; surface that math
// so a user with a 280-char caption + a 60-char CTA doesn't get blindsided.
const ctaSuffixLength = computed(() => {
  if (!props.ctaUrl) return 0;
  const label = props.ctaLabel?.trim();
  const suffix = label ? `${label}: ${props.ctaUrl}` : props.ctaUrl;
  return suffix.length + 2; // +2 for the \n\n separator
});
const activeLength = computed(() => activeText.value.length);
const publishedLength = computed(() => activeLength.value + ctaSuffixLength.value);
const overLimit = computed(() => publishedLength.value > activeLimit.value);
const countTint = computed(() => {
  if (overLimit.value) return 'text-destructive';
  const ratio = publishedLength.value / activeLimit.value;
  if (ratio > 0.9) return 'text-amber-500';
  return 'text-muted-foreground';
});

// Which channels are over their own limit when published with the
// effective (variant ?? master) caption. Drives the warning badge on the
// chip even when that lane isn't active — so a too-long master can't hide.
const overLimitPlatforms = computed(() => {
  return props.platforms.filter((p) => {
    const text =
      typeof props.variants?.[p] === 'string'
        ? (props.variants[p] as string)
        : props.caption;
    return text.length + ctaSuffixLength.value > PLATFORM_LIMIT[p];
  });
});

const trimEnabled = computed(() => props.enableTrim !== false);
function requestTrim() {
  emit('request-trim', activeLane.value);
}

// Lane swap: brief opacity dip + 6px Y nudge via inline transform, driven
// by a watcher (no Vue Transition / no GSAP ticker). The CSS transition on
// .lane-textarea handles the actual interpolation on the compositor.
const swapState = ref<'idle' | 'out' | 'in'>('idle');
let swapTimer: ReturnType<typeof setTimeout> | null = null;
watch(activeLane, () => {
  if (swapTimer) clearTimeout(swapTimer);
  swapState.value = 'out';
  swapTimer = setTimeout(() => {
    swapState.value = 'in';
    swapTimer = setTimeout(() => {
      swapState.value = 'idle';
      swapTimer = null;
    }, 240);
  }, 80);
});
onBeforeUnmount(() => {
  if (swapTimer) clearTimeout(swapTimer);
});

const laneSwapStyle = computed(() => {
  if (swapState.value === 'out') return { opacity: '0.5', transform: 'translateY(4px)' };
  return { opacity: '1', transform: 'translateY(0)' };
});

// Per-platform chip style — gold filament when in sync, channel-hue ribbon
// when forked. Active state adds a thicker ring + slight scale. All values
// inline via CSS vars so per-platform hue is reactive without a stylesheet.
function chipStyle(p: SocialPlatform): Record<string, string> {
  const hue = PLATFORM_HUE[p];
  return {
    '--ch-hue': String(hue),
  };
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <h2 class="font-semibold text-gray-900 dark:text-white">Caption</h2>
          <span
            v-if="activeLane !== 'master'"
            class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium"
          >
            · editing {{ platformLabel(activeLane as SocialPlatform) }}
            {{ isForked(activeLane as SocialPlatform) ? '(forked)' : '(in sync)' }}
          </span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-xs font-mono" :class="countTint">
            {{ publishedLength }} / {{ activeLimit }}
          </span>
        </div>
      </div>
    </template>

    <!-- Channel chip row -->
    <div class="flex items-center gap-1.5 mb-3 flex-wrap">
      <button
        type="button"
        class="lane-chip lane-chip--master"
        :class="{ 'lane-chip--active': activeLane === 'master' }"
        @click="activeLane = 'master'"
      >
        <UIcon name="i-lucide-asterisk" class="w-3.5 h-3.5" />
        <span>Master</span>
      </button>

      <span v-if="platforms.length > 0" class="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      <button
        v-for="p in platforms"
        :key="p"
        type="button"
        class="lane-chip"
        :class="[
          isForked(p) ? 'lane-chip--forked' : 'lane-chip--insync',
          activeLane === p ? 'lane-chip--active' : '',
        ]"
        :style="chipStyle(p)"
        :title="isForked(p) ? `${platformLabel(p)} — forked variant` : `${platformLabel(p)} — in sync with master`"
        @click="activeLane = p"
      >
        <UIcon :name="platformIcon(p)" class="w-3.5 h-3.5" />
        <span>{{ platformLabel(p) }}</span>
        <UIcon
          v-if="isForked(p)"
          name="i-lucide-git-branch"
          class="w-3 h-3 opacity-75 -ml-0.5"
          aria-label="forked"
        />
        <span
          v-if="overLimitPlatforms.includes(p)"
          class="lane-chip__warn"
          aria-label="over limit"
        />
      </button>
    </div>

    <!-- Active lane textarea. Compositor-only swap animation: when the
         lane changes we briefly drop opacity + nudge Y, then settle. No
         Vue Transition (RAF-dependent — see motion-stack policy). -->
    <div :style="laneSwapStyle" class="lane-textarea">
      <UTextarea
        v-model="activeText"
        :placeholder="
          activeLane === 'master'
            ? 'Write your master caption — channels in sync will publish this verbatim.'
            : `Write a variant for ${platformLabel(activeLane as SocialPlatform)}. Editing here forks from master.`
        "
        :rows="6"
        autoresize
        class="w-full"
      />
    </div>

    <!-- Lane footer: draft + resync + trim affordances -->
    <div class="mt-3 flex items-center justify-between gap-3 flex-wrap">
      <div class="flex items-center gap-3">
        <AIEarnestDraftButton
          :loading="drafting"
          :placeholder="
            activeLane === 'master'
              ? 'What is this post about? Earnest drafts the caption + a version per channel.'
              : `What should the ${platformLabel(activeLane as SocialPlatform)} post say?`
          "
          @submit="(brief) => emit('request-draft', brief)"
        />
        <button
          v-if="activeLane !== 'master' && isForked(activeLane as SocialPlatform)"
          type="button"
          class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          @click="resyncActiveLane"
        >
          <UIcon name="i-lucide-rotate-ccw" class="w-3.5 h-3.5" />
          Resync to master
        </button>
        <span
          v-else-if="activeLane !== 'master'"
          class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <UIcon name="i-lucide-link" class="w-3.5 h-3.5" />
          In sync with master — start typing to fork
        </span>
      </div>

      <button
        v-if="trimEnabled && overLimit"
        type="button"
        class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-colors"
        @click="requestTrim"
      >
        <UIcon name="i-lucide-sparkles" class="w-3.5 h-3.5" />
        Earnest can trim to {{ activeLimit }}
      </button>
    </div>
  </UCard>
</template>

<style scoped>
/* ───────── Chip primitives ─────────────────────────────────────────── */
.lane-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  height: 1.625rem;
  padding: 0 0.625rem;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  position: relative;
  border: 1px solid transparent;
  transition: transform 400ms cubic-bezier(0.36, 0.66, 0.04, 1),
    background-color 240ms ease,
    color 240ms ease;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.lane-chip:hover {
  transform: translateY(-1px);
}
.lane-chip--active {
  transform: translateY(-1px);
}

/* ── Master chip ── */
.lane-chip--master {
  background: rgb(var(--ui-foreground, 17 24 39));
  color: rgb(var(--ui-background, 255 255 255));
  border-color: rgb(var(--ui-foreground, 17 24 39));
}
.lane-chip--master.lane-chip--active {
  box-shadow: 0 0 0 2px rgb(var(--ui-background, 255 255 255)),
    0 0 0 3px rgb(var(--ui-foreground, 17 24 39));
}

/* ── In-sync channel chip ── gold filament */
.lane-chip--insync {
  background: hsl(var(--ch-hue, 0), 35%, 97%);
  color: hsl(var(--ch-hue, 0), 30%, 30%);
  border: 1px solid transparent;
  background-image: linear-gradient(
      hsl(var(--ch-hue, 0), 35%, 97%),
      hsl(var(--ch-hue, 0), 35%, 97%)
    ),
    linear-gradient(
      120deg,
      hsl(45, 90%, 65%) 0%,
      hsl(40, 95%, 78%) 25%,
      hsl(50, 85%, 60%) 50%,
      hsl(40, 95%, 78%) 75%,
      hsl(45, 90%, 65%) 100%
    );
  background-origin: border-box;
  background-clip: padding-box, border-box;
  background-size: 100% 100%, 200% 100%;
  animation: filament-shift 3.6s ease-in-out infinite;
}
:global(.dark .lane-chip--insync) {
  background-image: linear-gradient(
      hsl(var(--ch-hue, 0), 22%, 14%),
      hsl(var(--ch-hue, 0), 22%, 14%)
    ),
    linear-gradient(
      120deg,
      hsl(45, 70%, 55%) 0%,
      hsl(40, 80%, 65%) 25%,
      hsl(50, 65%, 50%) 50%,
      hsl(40, 80%, 65%) 75%,
      hsl(45, 70%, 55%) 100%
    );
  color: hsl(var(--ch-hue, 0), 40%, 85%);
}

/* ── Forked channel chip ── divergence ribbon */
.lane-chip--forked {
  background: hsl(var(--ch-hue, 0), 65%, 92%);
  color: hsl(var(--ch-hue, 0), 60%, 28%);
  border-color: hsl(var(--ch-hue, 0), 70%, 55%);
  animation: ribbon-breathe 2.4s ease-in-out infinite;
}
:global(.dark .lane-chip--forked) {
  background: hsl(var(--ch-hue, 0), 35%, 18%);
  color: hsl(var(--ch-hue, 0), 60%, 80%);
  border-color: hsl(var(--ch-hue, 0), 60%, 55%);
}

/* Active forked chip stays brighter and lifted. */
.lane-chip--forked.lane-chip--active {
  background: hsl(var(--ch-hue, 0), 70%, 88%);
  box-shadow: 0 2px 8px -2px hsl(var(--ch-hue, 0), 70%, 55%, 0.4);
}
:global(.dark .lane-chip--forked.lane-chip--active) {
  background: hsl(var(--ch-hue, 0), 40%, 24%);
}

/* In-sync active gets a subtle ring matching the channel hue. */
.lane-chip--insync.lane-chip--active {
  box-shadow: 0 2px 8px -2px hsl(var(--ch-hue, 0), 50%, 60%, 0.3);
}

/* Tiny warning dot for over-limit channels. */
.lane-chip__warn {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: hsl(var(--ch-hue, 0), 80%, 55%);
  box-shadow: 0 0 0 2px var(--ui-background, white);
  animation: ribbon-breathe 1.8s ease-in-out infinite;
}

/* ───────── Animations ─────────────────────────────────────────────── */
@keyframes filament-shift {
  0%, 100% { background-position: 0 0, 0% 50%; }
  50% { background-position: 0 0, 100% 50%; }
}
@keyframes ribbon-breathe {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .lane-chip--insync,
  .lane-chip--forked,
  .lane-chip__warn {
    animation: none;
  }
  .lane-chip {
    transition: none;
  }
}

/* ───────── Lane swap (compositor-only) ─────────────────────────────── */
.lane-textarea {
  transition:
    opacity 240ms cubic-bezier(0.36, 0.66, 0.04, 1),
    transform 240ms cubic-bezier(0.36, 0.66, 0.04, 1);
  will-change: opacity, transform;
}
@media (prefers-reduced-motion: reduce) {
  .lane-textarea {
    transition: none;
  }
}
</style>
