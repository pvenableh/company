<script setup lang="ts">
/**
 * ClientFilterSelect — a LOCAL, per-board client filter control.
 *
 * The rounded-full pill sibling of the Tickets board's Due Date / Project
 * selects. Drop it into any board toolbar with a `v-model` bound to a
 * `useClientFilter().clientId`, and the board folds `clientFilter.value` into
 * its Directus filter. Self-contained: it loads its own options via
 * `useClients().getClientOptions()` and refetches when the org changes.
 *
 * This is deliberately NOT the removed global chrome filter — every instance
 * owns its own selection (see `useClientFilter`).
 *
 * Renders nothing when the org has zero selectable clients, so boards for
 * solo/no-client orgs don't show a dead control.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const props = withDefaults(
  defineProps<{
    /** Selected client id, or 'org' for org-own work, or null for all. */
    modelValue?: string | null;
    /** Add a "No client" option (items with no client assigned → internal work). */
    includeUnassigned?: boolean;
    /** Trigger width utility — override for tighter toolbars. */
    triggerClass?: string;
  }>(),
  {
    modelValue: null,
    includeUnassigned: false,
    triggerClass: 'w-48',
  },
);

const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

const { selectedOrg } = useOrganization();
const { getClientOptions } = useClients();

const clientOptions = ref<{ label: string; value: string }[]>([]);
const loading = ref(false);

async function loadOptions() {
  if (!selectedOrg.value) {
    clientOptions.value = [];
    return;
  }
  loading.value = true;
  try {
    clientOptions.value = await getClientOptions();
  } catch (err) {
    console.error('[ClientFilterSelect] failed to load client options', err);
    clientOptions.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadOptions);
watch(() => selectedOrg.value, () => {
  // Org switch invalidates the current selection and the option set.
  if (props.modelValue && props.modelValue !== 'org') emit('update:modelValue', null);
  loadOptions();
});

// If the selected client drops out of the fetched list (archived, reassigned),
// clear the filter so the board doesn't sit on an invisible constraint.
watch(clientOptions, (opts) => {
  const id = props.modelValue;
  if (id && id !== 'org' && !opts.some((o) => o.value === id)) {
    emit('update:modelValue', null);
  }
});

// The Select model is string-only; 'all' is the no-filter sentinel.
const model = computed<string>({
  get: () => props.modelValue ?? 'all',
  set: (val) => emit('update:modelValue', val === 'all' ? null : val),
});

const hasClients = computed(() => clientOptions.value.length > 0);
const isActive = computed(() => !!props.modelValue);
</script>

<template>
  <Select v-if="hasClients" v-model="model">
    <SelectTrigger size="sm" :class="['h-8 rounded-full text-xs gap-1.5', triggerClass]">
      <Icon
        name="lucide:users"
        class="w-3.5 h-3.5 shrink-0"
        :class="isActive ? 'text-primary' : 'text-muted-foreground'"
      />
      <SelectValue placeholder="All clients" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">All clients</SelectItem>
      <SelectItem v-if="includeUnassigned" value="org">No client (internal)</SelectItem>
      <SelectItem v-for="opt in clientOptions" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>
