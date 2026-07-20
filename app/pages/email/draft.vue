<script setup lang="ts">
/**
 * Email → Draft with Earnest.
 * Full-surface home for the Email Generative Canvas. Standalone route while the
 * pattern proves out; a follow-up threads it into the newsletter builder.
 */
definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Draft an email with Earnest' });
</script>

<template>
  <div class="email-draft">
    <NewsletterEmailGenerativeCanvas />
  </div>
</template>

<style scoped>
.email-draft {
  /* Fill the shell's content box (it already reserves room for the floating
     dock). A 100dvh wrapper overflows and hides the composer behind the rail. */
  height: 100%;
  min-height: 30rem;
  padding: 0.5rem;
}
</style>
