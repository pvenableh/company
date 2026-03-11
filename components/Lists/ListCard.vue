<template>
  <div
    class="border rounded-lg p-4 hover:border-foreground/20 cursor-pointer transition-colors"
    @click="$emit('click', list)"
  >
    <div class="flex items-start justify-between">
      <div>
        <h3 class="font-medium text-sm">{{ list.name }}</h3>
        <p v-if="list.description" class="text-xs text-muted-foreground mt-1">
          {{ list.description }}
        </p>
      </div>
      <span
        v-if="list.is_default"
        class="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full"
      >
        Default
      </span>
    </div>
    <div class="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
      <span class="flex items-center gap-1">
        <Icon name="lucide:users" class="w-3.5 h-3.5" />
        {{ list.subscriber_count?.toLocaleString() || 0 }} subscribers
      </span>
      <span v-if="list.double_opt_in" class="flex items-center gap-1">
        <Icon name="lucide:shield-check" class="w-3.5 h-3.5" />
        Double opt-in
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MailingList } from '~/types/email/contacts';

defineProps<{ list: MailingList }>();
defineEmits<{ click: [list: MailingList] }>();
</script>
