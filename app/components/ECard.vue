<script setup lang="ts">
/**
 * UCard - Card wrapper composing shadcn-vue Card primitives.
 * Provides a simplified header/body/footer slot API.
 */

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'

const props = defineProps<{
  class?: string
  ui?: {
    header?: string
    body?: string
    footer?: string
  }
}>()
</script>

<template>
  <Card :class="props.class">
    <CardHeader v-if="$slots.header" :class="props.ui?.header">
      <slot name="header" />
    </CardHeader>
    <CardContent :class="props.ui?.body">
      <slot />
    </CardContent>
    <CardFooter v-if="$slots.footer" :class="props.ui?.footer">
      <slot name="footer" />
    </CardFooter>
  </Card>
</template>
