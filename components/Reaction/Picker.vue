<script setup lang="ts">
import type { ReactionType } from '~/types/reactions';
import { REACTION_TYPES, REACTION_ICONS } from '~/types/reactions';

const emit = defineEmits<{
  select: [reaction: ReactionType];
}>();
</script>

<template>
  <div class="reaction-picker">
    <div class="flex gap-1">
      <Tooltip v-for="type in REACTION_TYPES" :key="type">
        <TooltipTrigger as-child>
          <button
            class="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            @click="emit('select', type)"
          >
            <Icon
              :name="REACTION_ICONS[type].outline"
              class="h-4 w-4 text-gray-500"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p class="text-xs capitalize">{{ type }}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  </div>
</template>
