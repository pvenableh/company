<template>
  <span
    class="inline-flex items-center rounded-full px-2 py-0.5 cg-text-label capitalize"
    :class="badgeClasses"
  >
    <slot>{{ status }}</slot>
  </span>
</template>

<script setup lang="ts">
const props = defineProps<{
  status?: string | null;
}>();

const { getStatusBadgeClasses } = useStatusStyle();

const badgeClasses = computed(() => getStatusBadgeClasses(props.status));
</script>
