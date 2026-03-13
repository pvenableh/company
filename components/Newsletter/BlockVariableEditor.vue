<template>
  <div class="space-y-3 p-3">
    <div v-for="field in schema" :key="field.key" class="space-y-1">
      <label class="text-xs font-medium text-foreground">
        {{ field.label }}
        <span v-if="field.required" class="text-destructive">*</span>
      </label>

      <!-- Color input -->
      <div v-if="field.type === 'color'" class="flex items-center gap-2">
        <input
          type="color"
          :value="getColorValue(field)"
          class="w-8 h-8 rounded border cursor-pointer shrink-0"
          @input="handleColorInput(field.key, ($event.target as HTMLInputElement).value)"
        />
        <input
          type="text"
          :value="getColorDisplay(field)"
          placeholder="transparent"
          class="flex-1 rounded-md border px-2 py-1 text-xs bg-background font-mono"
          @input="handleColorText(field.key, ($event.target as HTMLInputElement).value)"
        />
        <button
          v-if="variables[field.key] && variables[field.key] !== 'transparent'"
          type="button"
          class="text-muted-foreground hover:text-foreground text-xs px-1"
          title="Reset to transparent"
          @click="emit('update', field.key, 'transparent')"
        >
          ✕
        </button>
      </div>

      <!-- Boolean toggle -->
      <div v-else-if="field.type === 'boolean'" class="flex items-center gap-2">
        <input
          type="checkbox"
          :checked="variables[field.key] === true || variables[field.key] === 'true'"
          class="rounded"
          @change="emit('update', field.key, ($event.target as HTMLInputElement).checked)"
        />
      </div>

      <!-- HTML textarea -->
      <textarea
        v-else-if="field.type === 'html'"
        :value="variables[field.key] || field.default || ''"
        rows="3"
        class="w-full rounded-md border px-2 py-1.5 text-xs bg-background font-mono resize-y"
        @input="emit('update', field.key, ($event.target as HTMLTextAreaElement).value)"
      />

      <!-- URL input -->
      <div v-else-if="field.type === 'url' || field.type === 'image'" class="relative">
        <input
          type="text"
          :value="variables[field.key] || field.default || ''"
          :placeholder="field.type === 'image' ? 'https://example.com/image.jpg' : 'https://example.com'"
          class="w-full rounded-md border px-2 py-1.5 text-xs bg-background pl-7"
          @input="emit('update', field.key, ($event.target as HTMLInputElement).value)"
        />
        <span class="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">
          {{ field.type === 'image' ? '🖼' : '🔗' }}
        </span>
      </div>

      <!-- Text input -->
      <input
        v-else
        type="text"
        :value="variables[field.key] || field.default || ''"
        :placeholder="field.description || field.label"
        class="w-full rounded-md border px-2 py-1.5 text-xs bg-background"
        @input="emit('update', field.key, ($event.target as HTMLInputElement).value)"
      />

      <p v-if="field.description" class="text-[11px] text-muted-foreground">
        {{ field.description }}
      </p>
    </div>

    <div v-if="!schema?.length" class="text-xs text-muted-foreground py-2">
      This block has no configurable variables.
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BlockVariableDefinition } from '~/types/email/blocks';

const props = defineProps<{
  schema: BlockVariableDefinition[] | null;
  variables: Record<string, any>;
}>();

const emit = defineEmits<{
  update: [key: string, value: any];
}>();

/** Get a valid hex color for the native color picker (transparent → #000000). */
function getColorValue(field: BlockVariableDefinition): string {
  const val = props.variables[field.key] || field.default || '';
  if (!val || val === 'transparent') return '#000000';
  return val;
}

/** Get the text display for the color text input. */
function getColorDisplay(field: BlockVariableDefinition): string {
  const val = props.variables[field.key];
  if (val === 'transparent' || val === '') return '';
  return val || field.default || '';
}

/** Handle color picker input — never emit empty strings. */
function handleColorInput(key: string, value: string) {
  emit('update', key, value || 'transparent');
}

/** Handle color text input — fall back to transparent for empty. */
function handleColorText(key: string, value: string) {
  const trimmed = value.trim();
  emit('update', key, trimmed || 'transparent');
}
</script>
