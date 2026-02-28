<script setup lang="ts">
import type { ReactionType } from '~/types/reactions';
import { REACTION_ICONS } from '~/types/reactions';

const props = defineProps<{
  collection: string;
  itemId: string;
}>();

const { useReactionSummary, toggleReaction } = useReactions();
const { summary, loading, refresh } = useReactionSummary(props.collection, props.itemId);

const showPicker = ref(false);

async function handleToggle(reaction: ReactionType) {
  try {
    await toggleReaction({
      table: props.collection,
      item: props.itemId,
      reaction,
    });
    await refresh();
  } catch (e) {
    console.error('Failed to toggle reaction:', e);
  }
}

function handlePickerSelect(reaction: ReactionType) {
  showPicker.value = false;
  handleToggle(reaction);
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
        v-for="group in summary.groups"
        :key="group.reaction"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors"
        :class="group.hasReacted
          ? 'border-[#C4A052]/30 bg-[#C4A052]/10 text-[#C4A052]'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 hover:border-gray-300'"
        @click="handleToggle(group.reaction)"
      >
        <Icon
          :name="group.hasReacted
            ? REACTION_ICONS[group.reaction]?.solid
            : REACTION_ICONS[group.reaction]?.outline"
          class="h-3.5 w-3.5"
        />
        <span class="text-[10px] font-medium">{{ group.count }}</span>
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
