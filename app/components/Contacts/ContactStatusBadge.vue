<template>
  <span
    class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize"
    :class="getStatusBadgeClasses(status)"
  >
    {{ status }}
  </span>
</template>

<script setup lang="ts">
import type { ContactStatus } from '~~/shared/email/contacts';

defineProps<{ status: ContactStatus }>();

const { getStatusBadgeClasses } = useStatusStyle();
</script>
