<template>
  <div class="space-y-1">
    <draggable
      :list="localBlocks"
      item-key="instanceId"
      handle=".drag-handle"
      ghost-class="canvas-ghost"
      drag-class="canvas-drag"
      animation="250"
      @start="dragging = true"
      @end="handleDragEnd"
    >
      <template #item="{ element, index }">
        <div class="canvas-block-wrapper">
          <!-- Insert-between drop zone -->
          <div
            v-if="index === 0"
            class="insert-zone"
            @dragover.prevent
          />

          <NewsletterCanvasBlockItem
            :canvas-block="element"
            :is-first="index === 0"
            :is-last="index === localBlocks.length - 1"
            :is-focused="focusedBlock === element.instanceId"
            @remove="$emit('remove', $event)"
            @move="$emit('move', $event)"
            @duplicate="$emit('duplicate', $event)"
            @update-vars="$emit('update-vars', $event)"
            @focus="focusedBlock = element.instanceId"
          />
        </div>
      </template>
    </draggable>
  </div>
</template>

<script setup lang="ts">
import draggable from 'vuedraggable';
import type { CanvasBlock } from '~~/types/email/blocks';

const props = defineProps<{
  blocks: CanvasBlock[];
}>();

const emit = defineEmits<{
  remove: [instanceId: string];
  move: [payload: { id: string; direction: 'up' | 'down' }];
  duplicate: [instanceId: string];
  'update-vars': [payload: { id: string; vars: Record<string, any> }];
  reorder: [blocks: CanvasBlock[]];
}>();

const dragging = ref(false);
const focusedBlock = ref<string | null>(null);

// Mutable local copy for vuedraggable to reorder in-place
const localBlocks = ref<CanvasBlock[]>([]);

// Sync from props when blocks change externally (add/remove/move)
watch(
  () => props.blocks,
  (newBlocks) => {
    if (!dragging.value) {
      localBlocks.value = [...newBlocks];
    }
  },
  { immediate: true },
);

function handleDragEnd() {
  dragging.value = false;
  emit('reorder', [...localBlocks.value]);
}
</script>

<style scoped>
.canvas-ghost {
  opacity: 0.3;
  border: 2px dashed hsl(var(--primary));
  border-radius: 0.5rem;
}

.canvas-drag {
  opacity: 0.9;
  transform: rotate(1deg);
  box-shadow: 0 8px 25px -5px rgba(0, 0, 0, 0.2);
}

.canvas-block-wrapper {
  margin-bottom: 0.5rem;
}

.insert-zone {
  height: 4px;
  margin-bottom: 0.25rem;
  border-radius: 2px;
  transition: all 0.2s ease;
}
</style>
