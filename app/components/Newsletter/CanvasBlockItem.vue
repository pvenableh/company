<template>
  <div
    class="group rounded-lg border bg-card shadow-sm transition-all duration-200 hover:shadow-md"
    :class="{
      'ring-2 ring-primary': isEditing,
      'ring-1 ring-primary/40': isFocused && !isEditing,
    }"
    @click="$emit('focus')"
  >
    <!-- Block Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
      <div class="flex items-center gap-2 min-w-0">
        <!-- Drag handle -->
        <div
          class="drag-handle flex items-center justify-center w-5 h-5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          title="Drag to reorder"
        >
          <Icon name="lucide:grip-vertical" class="w-3.5 h-3.5" />
        </div>

        <span
          class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          :class="categoryStyle"
        >
          {{ canvasBlock.block.category }}
        </span>
        <span class="text-xs font-medium truncate text-foreground">{{ canvasBlock.block.name }}</span>
      </div>

      <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          class="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
          title="Move up"
          :disabled="isFirst"
          :class="{ 'opacity-30 cursor-not-allowed': isFirst }"
          @click.stop="$emit('move', { id: canvasBlock.instanceId, direction: 'up' })"
        >
          <Icon name="lucide:chevron-up" class="w-3.5 h-3.5" />
        </button>
        <button
          class="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
          title="Move down"
          :disabled="isLast"
          :class="{ 'opacity-30 cursor-not-allowed': isLast }"
          @click.stop="$emit('move', { id: canvasBlock.instanceId, direction: 'down' })"
        >
          <Icon name="lucide:chevron-down" class="w-3.5 h-3.5" />
        </button>
        <div class="w-px h-4 bg-border mx-0.5" />
        <button
          class="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
          title="Duplicate block"
          @click.stop="$emit('duplicate', canvasBlock.instanceId)"
        >
          <Icon name="lucide:copy" class="w-3.5 h-3.5" />
        </button>
        <button
          class="p-1 rounded hover:bg-accent text-muted-foreground transition-colors"
          :class="{ 'bg-accent text-foreground': isEditing }"
          title="Edit variables"
          @click.stop="isEditing = !isEditing"
        >
          <Icon name="lucide:settings-2" class="w-3.5 h-3.5" />
        </button>
        <button
          class="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title="Remove block"
          @click.stop="$emit('remove', canvasBlock.instanceId)"
        >
          <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Variable Editor (collapsible with transition) -->
    <Transition name="slide-down">
      <div v-if="isEditing" class="border-t">
        <NewsletterBlockVariableEditor
          :schema="parsedSchema"
          :variables="canvasBlock.variables"
          @update="handleVarUpdate"
        />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { CanvasBlock } from '~~/shared/email/blocks';
import { parseVariablesSchema } from '~~/shared/email/blocks';

const props = defineProps<{
  canvasBlock: CanvasBlock;
  isFirst: boolean;
  isLast: boolean;
  isFocused?: boolean;
}>();

const emit = defineEmits<{
  remove: [instanceId: string];
  move: [payload: { id: string; direction: 'up' | 'down' }];
  duplicate: [instanceId: string];
  'update-vars': [payload: { id: string; vars: Record<string, any> }];
  focus: [];
}>();

const isEditing = ref(false);
const parsedSchema = computed(() => parseVariablesSchema(
  props.canvasBlock.block.variables_schema,
  props.canvasBlock.block.mjml_source,
));

function handleVarUpdate(key: string, value: any) {
  emit('update-vars', {
    id: props.canvasBlock.instanceId,
    vars: { [key]: value },
  });
}

/** Category-specific color styling */
const categoryStyle = computed(() => {
  const cat = props.canvasBlock.block.category;
  const styles: Record<string, string> = {
    header: 'bg-blue-500/10 text-blue-600',
    hero: 'bg-violet-500/10 text-violet-600',
    content: 'bg-green-500/10 text-green-600',
    'two-column': 'bg-amber-500/10 text-amber-600',
    'three-column': 'bg-amber-500/10 text-amber-600',
    cta: 'bg-red-500/10 text-red-600',
    image: 'bg-cyan-500/10 text-cyan-600',
    stats: 'bg-indigo-500/10 text-indigo-600',
    quote: 'bg-pink-500/10 text-pink-600',
    list: 'bg-teal-500/10 text-teal-600',
    divider: 'bg-gray-500/10 text-gray-600',
    social: 'bg-sky-500/10 text-sky-600',
    footer: 'bg-slate-500/10 text-slate-600',
  };
  return styles[cat] || 'bg-primary/10 text-primary';
});
</script>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}
.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 500px;
  opacity: 1;
}
</style>
