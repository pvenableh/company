<!--
  AiSpendMark — the one, consistent "this spends AI tokens" marker.

  A small bolt (the same glyph the token meter uses) that rides on any control
  or surface which makes an LLM call and therefore DRAWS FROM the org's token
  balance. Its whole value is CONSISTENCY: it appears on generative actions and
  is *deliberately absent* on deterministic/algorithmic ones (proactive notices,
  briefings, snapshots, presence animation). So the absence has to be as trusted
  as the presence — never sprinkle it on a free action, never omit it on a paid
  one.

  Pairs with the token currency: same bolt as `Organization/TokenMeter.vue`
  ("AI Tokens"), so users read "the ⚡ marks what draws down my ⚡ balance."

  Icon-only by default (a quiet meta-glyph); pass `label` to spell it out inline
  ("Draft the plan  ⚡ Spends tokens"). `title`/`aria-label` always explain it.

  Props:
    :size    'xs' | 'sm'   glyph size (default 'xs' — 12px)
    :label   string        optional visible text after the bolt
    :muted   boolean       dim it further for dense chrome (default false)
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  size?: 'xs' | 'sm';
  label?: string;
  muted?: boolean;
}>(), {
  size: 'xs',
  muted: false,
});

const iconSize = computed(() => (props.size === 'sm' ? 'w-3.5 h-3.5' : 'w-3 h-3'));
// One-line explainer, reused for the native tooltip and the a11y name.
const explain = 'Uses AI — spends tokens from your balance';
</script>

<template>
  <span
    class="inline-flex items-center gap-1 align-middle text-amber-500 cursor-help"
    :class="muted ? 'opacity-60' : 'opacity-80'"
    :title="explain"
    :aria-label="explain"
    role="img"
  >
    <EIcon name="i-heroicons-bolt" :class="iconSize" />
    <span v-if="label" class="text-[10px] font-medium uppercase tracking-wider">{{ label }}</span>
  </span>
</template>
