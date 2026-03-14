<script setup lang="ts">
/**
 * StatusSwitch — wrapper around shadcn Switch for active/inactive status toggling.
 *
 * Props:
 *   modelValue: 'active' | 'inactive' | string — current status
 *   activeLabel: string — label shown when active (default: 'Active')
 *   inactiveLabel: string — label shown when inactive (default: 'Inactive')
 *   disabled: boolean
 *   loading: boolean — shows spinner while saving
 *
 * Emits:
 *   update:modelValue — new status string
 */
import { Switch } from '~/components/ui/switch';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    activeLabel?: string;
    inactiveLabel?: string;
    disabled?: boolean;
    loading?: boolean;
  }>(),
  {
    activeLabel: 'Active',
    inactiveLabel: 'Inactive',
    disabled: false,
    loading: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const isActive = computed(() => props.modelValue === 'active');

function onToggle(checked: boolean) {
  emit('update:modelValue', checked ? 'active' : 'inactive');
}
</script>

<template>
  <label
    class="inline-flex items-center gap-2 cursor-pointer select-none"
    :class="{ 'opacity-50 pointer-events-none': disabled }"
    @click.stop
  >
    <Switch
      :model-value="isActive"
      :disabled="disabled || loading"
      @update:model-value="onToggle"
    />
    <span class="text-xs font-medium" :class="isActive ? 'text-emerald-500' : 'text-muted-foreground'">
      <Icon v-if="loading" name="lucide:loader-2" class="w-3 h-3 animate-spin inline-block" />
      <template v-else>{{ isActive ? activeLabel : inactiveLabel }}</template>
    </span>
  </label>
</template>
