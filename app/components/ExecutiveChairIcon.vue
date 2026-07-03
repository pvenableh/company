<!--
  ExecutiveChairIcon — the Director's Office signature mark: a shaded executive
  (CEO) office chair. Colours are driven by CSS vars so they adapt in dark mode
  (leather + castors lighten so the chair still reads on dark surfaces).

  Two renders:
   • default — full multi-colour illustration (dark-brown leather, silver frame,
     black castors) for LIGHT signature surfaces (header / hero / buttons).
   • `mono`  — every part collapses to `currentColor`, giving a single-colour
     chair silhouette that tints with its context (used in the app rail so it
     matches the palette, like the other monotone rail glyphs).

  Sized by the consumer via a class (e.g. `w-6 h-6`).
-->
<template>
  <svg viewBox="0 0 512 512" fill="none" aria-hidden="true" :class="props.class" :style="mono ? monoVars : undefined">
    <!-- Armrest supports + centre column -->
    <path fill="var(--ec-frame)" d="M361.931,291.31c4.866,0,8.828-3.961,8.828-8.828v-52.966h17.655v52.966 c0,14.603-11.88,26.483-26.483,26.483h-17.655V291.31H361.931z" />
    <rect x="247.172" y="247.172" fill="var(--ec-frame)" width="17.655" height="194.207" />
    <path fill="var(--ec-frame-mid)" d="M264.828,370.759h-17.655c-4.875,0-8.828-3.953-8.828-8.828v-26.483h35.31v26.483 C273.655,366.806,269.703,370.759,264.828,370.759z" />
    <!-- Five-star base + castors -->
    <path fill="var(--ec-frame-light)" d="M344.276,494.345v-20.126c0-7.597-4.862-14.343-12.069-16.745l-69.228-23.075 c-4.53-1.51-9.427-1.51-13.956,0l-69.224,23.073c-7.211,2.403-12.074,9.151-12.074,16.751v20.121h17.655v-20.12l61.793-20.597v31.89 h17.655v-31.89l61.793,20.597v20.12H344.276z" />
    <circle fill="var(--ec-castor)" cx="167.724" cy="494.345" r="17.655" />
    <circle fill="var(--ec-castor)" cx="344.276" cy="494.345" r="17.655" />
    <path fill="var(--ec-frame)" d="M150.069,291.31c-4.866,0-8.828-3.961-8.828-8.828v-52.966h-17.655v52.966 c0,14.603,11.88,26.483,26.483,26.483h17.655V291.31H150.069z" />
    <path fill="var(--ec-castor)" d="M256,512L256,512c-4.875,0-8.828-3.953-8.828-8.828v-17.655c0-4.875,3.953-8.828,8.828-8.828l0,0 c4.875,0,8.828,3.953,8.828,8.828v17.655C264.828,508.047,260.875,512,256,512z" />
    <!-- Seat -->
    <path fill="var(--ec-frame-dark)" d="M194.207,317.793l21.186,28.248c3.335,4.446,8.567,7.062,14.124,7.062h52.966 c5.557,0,10.79-2.616,14.124-7.062l21.186-28.248H194.207z" />
    <path fill="var(--ec-leather)" d="M326.621,326.621H185.379c-14.626,0-26.483-11.857-26.483-26.483v-8.828 c0-4.875,3.953-8.828,8.828-8.828h176.552c4.875,0,8.828,3.953,8.828,8.828v8.828C353.103,314.764,341.247,326.621,326.621,326.621z" />
    <path fill="var(--ec-leather-mid)" d="M185.379,326.621h141.241c14.626,0,26.483-11.857,26.483-26.483H158.897 C158.897,314.764,170.753,326.621,185.379,326.621z" />
    <!-- High back + headrest -->
    <path fill="var(--ec-leather)" d="M302.657,17.655h-93.313c-18.489,0-33.848,14.263-35.214,32.702l-11.722,158.244 C160.512,234.193,180.764,256,206.425,256h99.15c25.661,0,45.913-21.807,44.018-47.399L337.87,50.357 C336.504,31.918,321.146,17.655,302.657,17.655z" />
    <path fill="var(--ec-leather-mid)" d="M285.182,0h-58.364c-8.63,0-15.996,6.24-17.415,14.753l-2.943,17.655 c-1.793,10.761,6.505,20.557,17.415,20.557h64.248c10.91,0,19.209-9.796,17.415-20.557l-2.943-17.655 C301.177,6.24,293.812,0,285.182,0z" />
    <!-- Armrests -->
    <path fill="var(--ec-leather-dark)" d="M150.069,247.172h-26.483c-4.875,0-8.828-3.953-8.828-8.828l0,0c0-4.875,3.953-8.828,8.828-8.828 h26.483c4.875,0,8.828,3.953,8.828,8.828l0,0C158.897,243.22,154.944,247.172,150.069,247.172z" />
    <path fill="var(--ec-leather-dark)" d="M361.931,247.172h26.483c4.875,0,8.828-3.953,8.828-8.828l0,0c0-4.875-3.953-8.828-8.828-8.828 h-26.483c-4.875,0-8.828,3.953-8.828,8.828l0,0C353.103,243.22,357.056,247.172,361.931,247.172z" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ class?: string; mono?: boolean }>();

// Monotone render: collapse every part to the inherited text colour.
const VARS = [
  '--ec-leather', '--ec-leather-mid', '--ec-leather-dark',
  '--ec-frame', '--ec-frame-light', '--ec-frame-mid', '--ec-frame-dark',
  '--ec-castor',
];
const monoVars = computed(() => Object.fromEntries(VARS.map((v) => [v, 'currentColor'])));
</script>

<style scoped>
svg {
  --ec-leather: #6b4a2e;
  --ec-leather-mid: #553a24;
  --ec-leather-dark: #412c1a;
  --ec-frame: #b8bac2;
  --ec-frame-light: #cdd0d8;
  --ec-frame-mid: #9a9ca6;
  --ec-frame-dark: #7c7e88;
  --ec-castor: #141414;
}
/* Dark mode: warm the leather to a lit caramel and lift the castors off black
   so the chair still reads on dark tiles. Silver frame stays (reads on both). */
:global(.dark) svg {
  --ec-leather: #ca9c60;
  --ec-leather-mid: #a9743f;
  --ec-leather-dark: #8a5a30;
  --ec-frame: #c4c6ce;
  --ec-frame-light: #d8dae2;
  --ec-frame-mid: #a8aab2;
  --ec-frame-dark: #8a8c94;
  --ec-castor: #55555d;
}
</style>
