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
          :value="variables[field.key] || field.default || '#000000'"
          class="w-8 h-8 rounded border cursor-pointer"
          @input="emit('update', field.key, ($event.target as HTMLInputElement).value)"
        />
        <input
          type="text"
          :value="variables[field.key] || field.default || ''"
          class="flex-1 rounded-md border px-2 py-1 text-xs bg-background"
          @input="emit('update', field.key, ($event.target as HTMLInputElement).value)"
        />
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

      <!-- Text/URL/Image input -->
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

defineProps<{
  schema: BlockVariableDefinition[] | null;
  variables: Record<string, any>;
}>();

const emit = defineEmits<{
  update: [key: string, value: any];
}>();
</script>
