<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="$emit('close')">
    <div class="bg-background rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b shrink-0">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon :name="typeIcon" class="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 class="font-semibold text-sm">Edit {{ typeLabel }}</h3>
            <p v-if="currentPartial" class="text-[11px] text-muted-foreground">{{ currentPartial.name }}</p>
          </div>
        </div>
        <button class="text-muted-foreground hover:text-foreground transition-colors" @click="$emit('close')">
          <Icon name="lucide:x" class="w-4 h-4" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <!-- Partial selector (if multiple available) -->
        <div v-if="availablePartials.length > 1" class="space-y-1.5">
          <label class="text-xs font-medium">Template</label>
          <select
            :value="currentPartial?.id"
            class="w-full rounded-md border px-3 py-2 text-sm bg-background"
            @change="handlePartialChange(Number(($event.target as HTMLSelectElement).value))"
          >
            <option
              v-for="p in availablePartials"
              :key="p.id"
              :value="p.id"
            >
              {{ p.name }}{{ !p.organization ? ' (Default)' : '' }}
            </option>
          </select>
        </div>

        <!-- Variable editor -->
        <div v-if="parsedSchema.length">
          <p class="text-[11px] text-muted-foreground mb-3">
            Customize this {{ typeLabel.toLowerCase() }} for your organization. Changes are saved per-template.
          </p>
          <NewsletterBlockVariableEditor
            :schema="parsedSchema"
            :variables="localVariables"
            @update="handleVarUpdate"
          />
        </div>

        <div v-else-if="currentPartial" class="text-center py-6 text-muted-foreground">
          <Icon name="lucide:settings-2" class="w-6 h-6 mx-auto mb-2 opacity-40" />
          <p class="text-xs">This {{ typeLabel.toLowerCase() }} has no configurable variables.</p>
          <p class="text-[11px] mt-1">
            Edit the MJML source in Directus to add
            <code class="bg-muted px-1 rounded text-[10px]" v-text="'{{{ variable_name }}}'"></code>
            patterns.
          </p>
        </div>

        <div v-else class="text-center py-6 text-muted-foreground">
          <Icon name="lucide:alert-circle" class="w-6 h-6 mx-auto mb-2 opacity-40" />
          <p class="text-xs">No {{ typeLabel.toLowerCase() }} partial found.</p>
        </div>

        <!-- Feedback -->
        <div v-if="saveSuccess" class="rounded-md px-3 py-2 bg-green-500/10 text-green-700 text-xs flex items-center gap-1.5">
          <Icon name="lucide:check" class="w-3.5 h-3.5" />
          Saved successfully
        </div>
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-2 px-5 py-3 border-t shrink-0">
        <Button variant="outline" size="sm" @click="$emit('close')">Cancel</Button>
        <Button
          size="sm"
          :disabled="!hasChanges || saving"
          @click="handleSave"
        >
          <Icon name="lucide:save" class="w-3.5 h-3.5 mr-1" />
          {{ saving ? 'Saving…' : 'Save Changes' }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';
import type { EmailPartial, EmailPartialType } from '~~/shared/email/blocks';
import { parseVariablesSchema } from '~~/shared/email/blocks';

const props = defineProps<{
  type: EmailPartialType;
  partial: EmailPartial | null;
  builder: ReturnType<typeof useTemplateBuilder>;
}>();

const emit = defineEmits<{
  close: [];
  'partial-changed': [partial: EmailPartial];
  saved: [];
}>();

const { getPartial } = useEmailPartials();

const currentPartial = ref<EmailPartial | null>(props.partial);
const availablePartials = ref<EmailPartial[]>([]);
const localVariables = ref<Record<string, any>>({});
const originalVariables = ref<Record<string, any>>({});
const saving = ref(false);
const saveSuccess = ref(false);

const parsedSchema = computed(() => {
  if (!currentPartial.value) return [];
  return parseVariablesSchema(
    currentPartial.value.variables_schema,
    currentPartial.value.mjml_source,
  );
});

const hasChanges = computed(() => {
  return JSON.stringify(localVariables.value) !== JSON.stringify(originalVariables.value);
});

const typeLabel = computed(() => {
  switch (props.type) {
    case 'header': return 'Header';
    case 'footer': return 'Footer';
    case 'web_version_bar': return 'Web Version Bar';
    default: return 'Partial';
  }
});

const typeIcon = computed(() => {
  switch (props.type) {
    case 'header': return 'lucide:panel-top';
    case 'footer': return 'lucide:panel-bottom';
    case 'web_version_bar': return 'lucide:link';
    default: return 'lucide:layout';
  }
});

// Load available partials and set initial variables
onMounted(async () => {
  availablePartials.value = await props.builder.getPartialOptions(props.type);

  if (currentPartial.value) {
    const vars = { ...(currentPartial.value.instance_variables || {}) };
    // Fill in defaults from schema for any missing variables
    for (const def of parsedSchema.value) {
      if (!(def.key in vars)) {
        vars[def.key] = def.default ?? '';
      }
    }
    localVariables.value = vars;
    originalVariables.value = { ...vars };
  }
});

function handleVarUpdate(key: string, value: any) {
  localVariables.value = { ...localVariables.value, [key]: value };
}

async function handlePartialChange(id: number) {
  const partial = await getPartial(id);
  currentPartial.value = partial;

  const vars = { ...(partial.instance_variables || {}) };
  const schema = parseVariablesSchema(partial.variables_schema, partial.mjml_source);
  for (const def of schema) {
    if (!(def.key in vars)) {
      vars[def.key] = def.default ?? '';
    }
  }
  localVariables.value = vars;
  originalVariables.value = { ...vars };

  emit('partial-changed', partial);
}

async function handleSave() {
  if (!currentPartial.value) return;
  saving.value = true;
  try {
    await props.builder.updatePartialVariables(props.type, localVariables.value);
    originalVariables.value = { ...localVariables.value };
    saveSuccess.value = true;
    setTimeout(() => { saveSuccess.value = false; }, 2000);
    emit('saved');
  } catch (err) {
    console.error('Failed to save partial variables:', err);
  } finally {
    saving.value = false;
  }
}
</script>
