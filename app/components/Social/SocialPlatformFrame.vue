<script setup lang="ts">
/**
 * <SocialPlatformFrame> — a tiny SVG frame that MorphSVG-morphs between the
 * three post silhouettes (portrait / square / landscape) as Earnest changes a
 * post's platforms or format. A small, tasteful flourish on each post card:
 * the frame *reshapes* to the medium instead of swapping an icon.
 *
 * Uses GSAP MorphSVGPlugin (already used by <EarnestMark>); falls back to a
 * direct path set if the plugin isn't available, and honours reduced-motion.
 */
import { gsap } from 'gsap';
import { ensureEarnestGsap } from '~/composables/useEarnestPresence';
import type { PostType, SocialPlatform } from '~~/shared/social';

const props = defineProps<{
  platforms: SocialPlatform[];
  postType: PostType;
}>();

type Format = 'portrait' | 'square' | 'landscape';

/** Build a rounded-rect path with a FIXED command structure so any two morph cleanly. */
function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M ${x + r},${y} H ${x + w - r} A ${r},${r} 0 0 1 ${x + w},${y + r} V ${y + h - r} A ${r},${r} 0 0 1 ${x + w - r},${y + h} H ${x + r} A ${r},${r} 0 0 1 ${x},${y + h - r} V ${y + r} A ${r},${r} 0 0 1 ${x + r},${y} Z`;
}
const SHAPES: Record<Format, string> = {
  portrait: roundRect(7, 2, 10, 20, 2),
  square: roundRect(4, 3, 16, 16, 2),
  landscape: roundRect(2, 6, 20, 12, 2),
};

const format = computed<Format>(() => {
  const pt = props.postType;
  if (pt === 'story' || pt === 'reel') return 'portrait';
  const primary = props.platforms?.[0];
  if (pt === 'article' || primary === 'linkedin' || primary === 'facebook') return 'landscape';
  if (primary === 'tiktok') return 'portrait';
  return 'square';
});

const pathEl = ref<SVGPathElement | null>(null);
// `dAttr` is the value Vue binds. During a morph we DON'T touch it (so Vue
// doesn't instantly jump the path and rob GSAP of the tween) — GSAP owns the
// live `d` attribute, and we resync dAttr on complete.
const dAttr = ref(SHAPES[format.value]);
let morphOk = false;
let reduce = false;

onMounted(async () => {
  if (import.meta.client) {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const g = await ensureEarnestGsap();
    morphOk = g.morph;
  }
});

watch(format, (next) => {
  const el = pathEl.value;
  const d = SHAPES[next];
  if (!el || !import.meta.client || reduce || !morphOk) {
    dAttr.value = d; // instant set (no plugin / reduced-motion / SSR)
    return;
  }
  gsap.to(el, {
    duration: 0.5,
    ease: 'power2.inOut',
    morphSVG: d,
    // Resync the bound value once the morph lands so state stays consistent.
    onComplete: () => { dAttr.value = d; },
  });
});
</script>

<template>
  <svg class="spf" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path ref="pathEl" :d="dAttr" />
    <circle class="spf__dot" cx="12" cy="19" r="0.9" />
  </svg>
</template>

<style scoped>
.spf { display: block; }
.spf path { fill: none; stroke: currentColor; stroke-width: 1.6; opacity: 0.85; }
.spf__dot { fill: currentColor; opacity: 0.5; }
</style>
