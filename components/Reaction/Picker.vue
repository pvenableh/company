<script setup lang="ts">
import type { ReactionTypeRecord } from '~/types/reactions';

const emit = defineEmits<{
  select: [reactionTypeId: number];
}>();

const { useReactionTypes } = useReactions();
const { types, loading } = useReactionTypes();
</script>

<template>
  <div class="reaction-picker">
    <!-- Loading state -->
    <div v-if="loading" class="flex gap-1 p-1">
      <div v-for="i in 5" :key="i" class="h-8 w-8 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
    </div>

    <!-- Reaction types -->
    <div v-else class="flex gap-1">
      <Tooltip v-for="type in types" :key="type.id">
        <TooltipTrigger as-child>
          <button
            class="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            @click="emit('select', type.id)"
          >
            <span v-if="type.emoji" class="text-lg">{{ type.emoji }}</span>
            <Icon
              v-else-if="type.icon"
              :name="type.icon_family === 'heroicons'
                ? `i-heroicons-${type.icon}`
                : `i-lucide-${type.icon}`"
              class="h-4 w-4 text-gray-500"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p class="text-xs">{{ type.name }}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  </div>
</template>
