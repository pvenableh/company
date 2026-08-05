<script setup lang="ts">
/**
 * /pitches — folded into People → Pursuits → Pitches.
 *
 * The pitch manager is no longer its own app; it's the "Pitches" lens of the
 * Pursuits tab (component: PitchesManager). This route stays only as a redirect
 * so old bookmarks and the ?for=<type>:<id> deep-link keep working.
 */
definePageMeta({ middleware: ['auth'] })
const route = useRoute()
await navigateTo({
  path: '/apps/clients',
  query: {
    view: 'pursuits',
    lens: 'pitches',
    ...(route.query.for ? { for: String(route.query.for) } : {}),
  },
  replace: true,
})
</script>

<template>
  <div />
</template>
