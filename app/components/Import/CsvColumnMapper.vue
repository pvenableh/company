<template>
  <div class="space-y-3">
    <div
      v-for="header in headers"
      :key="header"
      class="flex items-center gap-3 p-3 border rounded-lg"
    >
      <span class="text-sm font-mono bg-muted px-2 py-0.5 rounded min-w-32 text-center">
        {{ header }}
      </span>
      <Icon name="lucide:arrow-right" class="w-4 h-4 text-muted-foreground shrink-0" />
      <select
        :value="modelValue[header] || 'custom_field'"
        @change="updateMapping(header, ($event.target as HTMLSelectElement).value)"
        class="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
      >
        <optgroup label="Contact Fields">
          <option v-for="f in contactFields" :key="f.value" :value="f.value">
            {{ f.label }}
          </option>
        </optgroup>
        <optgroup label="Other">
          <option value="custom_field">Custom Field</option>
          <option value="skip">Skip (don't import)</option>
        </optgroup>
      </select>
      <span
        v-if="isAutoMapped(header)"
        class="text-xs text-green-600 shrink-0"
      >
        Auto
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  headers: string[];
  modelValue: Record<string, string>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, string>];
}>();

const contactFields = [
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'prefix', label: 'Prefix' },
  { value: 'phone', label: 'Phone' },
  { value: 'title', label: 'Title' },
  { value: 'company', label: 'Company' },
  { value: 'industry', label: 'Industry' },
  { value: 'website', label: 'Website' },
  { value: 'mailing_address', label: 'Mailing Address' },
  { value: 'timezone', label: 'Timezone' },
  { value: 'tags', label: 'Tags' },
  { value: 'notes', label: 'Notes' },
];

const knownFieldValues = new Set(contactFields.map((f) => f.value));

function isAutoMapped(header: string): boolean {
  return knownFieldValues.has(props.modelValue[header]);
}

function updateMapping(header: string, value: string) {
  emit('update:modelValue', { ...props.modelValue, [header]: value });
}
</script>
