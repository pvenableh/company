<template>
  <span
    class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
    :class="statusClasses[status] || statusClasses.active"
  >
    {{ status }}
  </span>
</template>

<script setup lang="ts">
import type { ContactStatus } from '~~/shared/email/contacts';

defineProps<{ status: ContactStatus }>();

const statusClasses: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  unsubscribed: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  bounced: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  spam: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  archived: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};
</script>
