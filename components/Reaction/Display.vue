<script setup lang="ts">
import type { ReactableCollection, ReactionSummary, ReactionCount } from '~/types/reactions';

const props = defineProps<{
  collection: ReactableCollection;
  itemId: string;
}>();

const { useReactionSummary, toggleReaction, getReactionTypes } = useReactions();
const { summary, loading, refresh } = useReactionSummary(props.collection, props.itemId);

const showPicker = ref(false);

async function handleToggle(reactionTypeId: number) {
  try {
    await toggleReaction({
      collection: props.collection,
      item_id: props.itemId,
      reaction_type: reactionTypeId,
    });
    await refresh();
  } catch (e) {
    console.error('Failed to toggle reaction:', e);
  }
}

function handlePickerSelect(reactionTypeId: number) {
  showPicker.value = false;
  handleToggle(reactionTypeId);
}
</script>

<template>
  <div class="reaction-display flex flex-wrap items-center gap-1.5">
    <!-- Loading state -->
    <div v-if="loading" class="flex gap-1">
      <div v-for="i in 3" :key="i" class="h-6 w-10 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
    </div>

    <!-- Reaction badges -->
    <template v-else>
      <button
        v-for="reaction in summary.reactions"
        :key="reaction.reaction_type.id"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors"
        :class="reaction.hasReacted
          ? 'border-[#C4A052]/30 bg-[#C4A052]/10 text-[#C4A052]'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 hover:border-gray-300'"
        @click="handleToggle(reaction.reaction_type.id)"
      >
        <span v-if="reaction.reaction_type.emoji" class="text-sm">
          {{ reaction.reaction_type.emoji }}
        </span>
        <Icon
          v-else-if="reaction.reaction_type.icon"
          :name="reaction.reaction_type.icon_family === 'heroicons'
            ? `i-heroicons-${reaction.reaction_type.icon}${reaction.hasReacted ? '-solid' : ''}`
            : `i-lucide-${reaction.reaction_type.icon}`"
          class="h-3.5 w-3.5"
        />
        <span class="text-[10px] font-medium">{{ reaction.count }}</span>
      </button>

      <!-- Add reaction button -->
      <Popover v-model:open="showPicker">
        <PopoverTrigger as-child>
          <button
            class="inline-flex items-center justify-center h-6 w-6 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
          >
            <Icon name="i-heroicons-plus" class="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent class="w-auto p-2" align="start">
          <ReactionPicker
            @select="handlePickerSelect"
          />
        </PopoverContent>
      </Popover>
    </template>
  </div>
</template>
