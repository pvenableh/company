<template>
  <button
    class="flex items-center gap-3 w-full p-2.5 rounded-md text-left text-sm hover:bg-accent transition-colors group"
    @click="$emit('add', block)"
  >
    <div
      class="w-8 h-8 rounded flex items-center justify-center bg-muted text-muted-foreground text-xs font-bold uppercase shrink-0"
    >
      {{ block.category.charAt(0) }}
    </div>
    <div class="min-w-0 flex-1">
      <p class="font-medium text-xs truncate">{{ block.name }}</p>
      <p v-if="block.description" class="text-[11px] text-muted-foreground truncate">
        {{ block.description }}
      </p>
    </div>
    <Icon
      name="lucide:plus"
      class="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
    />
  </button>
</template>

<script setup lang="ts">
import type { NewsletterBlock } from '~/types/email/blocks';

defineProps<{ block: NewsletterBlock }>();
defineEmits<{ add: [block: NewsletterBlock] }>();
</script>
