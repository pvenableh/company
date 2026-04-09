<script setup lang="ts">
/**
 * USelect - NuxtUI-compatible select wrapper
 * Delegates to USelectMenu for full compatibility
 */
</script>

<template>
  <USelectMenu v-bind="$attrs">
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData || {}" />
    </template>
  </USelectMenu>
</template>
