<!--
  AiFreeMark — the inverse of AiSpendMark. Marks a surface/action that Earnest
  produces WITHOUT an LLM call: pure data analysis, snapshots, scorecards,
  deterministic notices. No tokens are drawn.

  Use it sparingly, only where users might reasonably assume an "Earnest" /
  "AI" surface costs tokens but it doesn't — e.g. Proactive Notices, the
  Boardroom briefing. It reassures; it is NOT required on every free control
  (most of the UI is free and unmarked by default). Pairs with [[AiSpendMark]].

  Props:
    :label   string    visible text (default "Free · from your data")
    :muted   boolean   dim further for dense chrome (default true)
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  label?: string;
  muted?: boolean;
}>(), {
  label: 'Free · from your data',
  muted: true,
});

const explain = 'No AI tokens — computed from your own data, not a language model';
</script>

<template>
  <span
    class="inline-flex items-center gap-1 align-middle text-emerald-600/80 dark:text-emerald-400/70 cursor-help"
    :class="muted ? 'opacity-70' : ''"
    :title="explain"
    :aria-label="explain"
    role="img"
  >
    <EIcon name="i-lucide-database" class="w-3 h-3" />
    <span v-if="label" class="text-[10px] font-medium uppercase tracking-wider">{{ label }}</span>
  </span>
</template>
