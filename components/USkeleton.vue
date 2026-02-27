<script setup lang="ts">
/**
 * USkeleton - NuxtUI-compatible skeleton wrapper for shadcn-vue Skeleton
 */

import { Skeleton } from '@/components/ui/skeleton'

defineProps<{
  class?: string
  ui?: Record<string, string>
}>()
</script>

<template>
  <Skeleton :class="[$props.class, $props.ui?.base]" />
</template>
