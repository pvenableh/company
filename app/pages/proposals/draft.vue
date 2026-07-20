<script setup lang="ts">
/**
 * Proposals → Draft with Earnest.
 * Full-surface home for the Document Generative Canvas. Standalone route while
 * the pattern proves out; a follow-up threads it into ProposalWorkspace.
 */
definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Draft a proposal with Earnest' });
</script>

<template>
  <div class="proposal-draft">
    <DocumentsDocumentGenerativeCanvas />
  </div>
</template>

<style scoped>
.proposal-draft {
  /* Fill the shell's content box (it already reserves room for the floating
     dock). A 100dvh wrapper overflows and hides the composer behind the rail. */
  height: 100%;
  min-height: 30rem;
  padding: 0.5rem;
}
</style>
