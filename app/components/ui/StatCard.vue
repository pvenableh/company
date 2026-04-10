<template>
  <div class="cg-card-compact">
    <p class="cg-text-label mb-1">
      <slot name="icon" />
      <slot name="label">{{ label }}</slot>
    </p>
    <p class="cg-text-stat text-foreground" :class="valueClass">
      <slot>{{ value }}</slot>
    </p>
    <p v-if="$slots.detail || detail" class="cg-text-child text-muted-foreground mt-0.5">
      <slot name="detail">{{ detail }}</slot>
    </p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label?: string;
  value?: string | number;
  detail?: string;
  valueClass?: string;
}>();
</script>
