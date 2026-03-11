<template>
  <div class="space-y-2">
    <label class="block text-sm font-medium">Custom Fields</label>
    <div v-for="(_, index) in fields" :key="index" class="flex gap-2">
      <input
        v-model="fields[index].key"
        placeholder="Key"
        class="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
        @input="emitUpdate"
      />
      <input
        v-model="fields[index].value"
        placeholder="Value"
        class="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
        @input="emitUpdate"
      />
      <Button variant="ghost" size="icon-sm" @click="removeField(index)">
        <Icon name="lucide:x" class="w-4 h-4" />
      </Button>
    </div>
    <Button variant="outline" size="sm" @click="addField">
      <Icon name="lucide:plus" class="w-3.5 h-3.5 mr-1" />
      Add Field
    </Button>
  </div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';

const props = defineProps<{
  modelValue: Record<string, any> | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>];
}>();

const fields = ref<Array<{ key: string; value: string }>>(
  Object.entries(props.modelValue || {}).map(([key, value]) => ({
    key,
    value: String(value),
  }))
);

if (fields.value.length === 0) {
  fields.value.push({ key: '', value: '' });
}

function addField() {
  fields.value.push({ key: '', value: '' });
}

function removeField(index: number) {
  fields.value.splice(index, 1);
  emitUpdate();
}

function emitUpdate() {
  const result: Record<string, any> = {};
  for (const field of fields.value) {
    if (field.key.trim()) {
      result[field.key.trim()] = field.value;
    }
  }
  emit('update:modelValue', result);
}
</script>
