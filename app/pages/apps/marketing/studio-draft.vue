<script setup lang="ts">
/**
 * Studio → Draft with Earnest.
 *
 * A dedicated, full-surface home for the Social Generative Canvas — the first
 * builder wired to the Generative Canvas kernel. Kept as its own route while
 * the pattern proves out; a follow-up threads it into the Studio lens chips.
 */
definePageMeta({ layout: 'apps', middleware: ['auth'] });

useHead({ title: 'Draft with Earnest' });
</script>

<template>
  <div class="studio-draft">
    <SocialGenerativeCanvas />
  </div>
</template>

<style scoped>
.studio-draft {
  /* Fill the apps content box exactly. NOT 100dvh — `.apps-shell__page` is the
     scroll container and already reserves padding-bottom for the floating dock,
     so a viewport-height wrapper overflows and pushes the composer under the
     rail. 100% resolves against the shell's content height instead. */
  height: 100%;
  min-height: 30rem;
  padding: 0.5rem;
}
</style>
