<template>
  <div
    class="group rounded-lg border bg-card shadow-sm transition-shadow hover:shadow-md"
    :class="{ 'ring-2 ring-primary': isEditing }"
  >
    <!-- Block Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
      <div class="flex items-center gap-2 min-w-0">
        <span
          class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-primary/10 text-primary"
        >
          {{ canvasBlock.block.category }}
        </span>
        <span class="text-xs font-medium truncate">{{ canvasBlock.block.name }}</span>
      </div>

      <div class="flex items-center gap-0.5">
        <button
          class="p-1 rounded hover:bg-accent text-muted-foreground"
          title="Move up"
          :disabled="isFirst"
          @click="$emit('move', { id: canvasBlock.instanceId, direction: 'up' })"
        >
          <Icon name="lucide:chevron-up" class="w-3.5 h-3.5" />
        </button>
        <button
          class="p-1 rounded hover:bg-accent text-muted-foreground"
          title="Move down"
          :disabled="isLast"
          @click="$emit('move', { id: canvasBlock.instanceId, direction: 'down' })"
        >
          <Icon name="lucide:chevron-down" class="w-3.5 h-3.5" />
        </button>
        <button
          class="p-1 rounded hover:bg-accent text-muted-foreground"
          :class="{ 'bg-accent': isEditing }"
          title="Edit variables"
          @click="isEditing = !isEditing"
        >
          <Icon name="lucide:settings-2" class="w-3.5 h-3.5" />
        </button>
        <button
          class="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="Remove block"
          @click="$emit('remove', canvasBlock.instanceId)"
        >
          <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Variable Editor (collapsible) -->
    <div v-if="isEditing">
      <NewsletterBlockVariableEditor
        :schema="parsedSchema"
        :variables="canvasBlock.variables"
        @update="handleVarUpdate"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CanvasBlock } from '~/types/email/blocks';
import { parseVariablesSchema } from '~/types/email/blocks';

const props = defineProps<{
  canvasBlock: CanvasBlock;
  isFirst: boolean;
  isLast: boolean;
}>();

const emit = defineEmits<{
  remove: [instanceId: string];
  move: [payload: { id: string; direction: 'up' | 'down' }];
  'update-vars': [payload: { id: string; vars: Record<string, any> }];
}>();

const isEditing = ref(false);
const parsedSchema = computed(() => parseVariablesSchema(props.canvasBlock.block.variables_schema));

function handleVarUpdate(key: string, value: any) {
  emit('update-vars', {
    id: props.canvasBlock.instanceId,
    vars: { [key]: value },
  });
}
</script>
