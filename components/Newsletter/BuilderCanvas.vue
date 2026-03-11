<template>
  <div class="space-y-3">
    <CanvasBlockItem
      v-for="(block, index) in blocks"
      :key="block.instanceId"
      :canvas-block="block"
      :is-first="index === 0"
      :is-last="index === blocks.length - 1"
      @remove="$emit('remove', $event)"
      @move="$emit('move', $event)"
      @update-vars="$emit('update-vars', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { CanvasBlock } from '~/types/email/blocks';

defineProps<{
  blocks: CanvasBlock[];
}>();

defineEmits<{
  remove: [instanceId: string];
  move: [payload: { id: string; direction: 'up' | 'down' }];
  'update-vars': [payload: { id: string; vars: Record<string, any> }];
}>();
</script>
