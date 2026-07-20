<!--
  ImportContactsPanel — 4-step CSV import wizard (Upload → Map →
  Preview → Results) lifted out of the legacy /contacts/import page so
  it lands inside the apps shell. Opens via:
    useAppSlideOver('import-contacts').open('new')

  The wizard is single-organization (uses `selectedOrg` from
  `useOrganization`) and POSTs to `/api/contacts/import`. Step
  navigation (Back / Continue / Import) is pinned in the shell's
  `#footer` so the long preview table on Step 2 scrolls under it.
-->
<script setup lang="ts">
import type { CsvImportResult, MailingList } from '~~/shared/email/contacts';
import type { FlipFromPayload } from '~/composables/useFlipFromRow';
import { Button } from '~/components/ui/button';
import AppSlideOverShell from '../AppSlideOverShell.vue';

defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { getLists } = useMailingLists();
const { downloadTemplate } = useCsvTemplate();
const { selectedOrg } = useOrganization();

const steps = ['Upload', 'Map Columns', 'Preview', 'Results'];
const currentStep = ref(0);

const fileInput = ref<HTMLInputElement | null>(null);
const csvFile = ref<File | null>(null);
const csvHeaders = ref<string[]>([]);
const csvRows = ref<Record<string, string>[]>([]);
const columnMapping = ref<Record<string, string>>({});
const lists = ref<MailingList[]>([]);
const targetListId = ref<number | null>(null);
const updateExisting = ref(false);
const importing = ref(false);
const importResult = ref<CsvImportResult | null>(null);

const previewHeaders = computed(() => csvHeaders.value.slice(0, 8));
const previewRows = computed(() => csvRows.value.slice(0, 5));
const canProceed = computed(() => {
  if (currentStep.value === 0) return csvFile.value !== null;
  if (currentStep.value === 1) return true;
  return true;
});

onMounted(async () => {
  lists.value = await getLists();
});

function handleFile(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.[0]) parseFile(input.files[0]);
}

function handleDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0];
  if (file && file.name.endsWith('.csv')) parseFile(file);
}

function parseFile(file: File) {
  csvFile.value = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return;

    csvHeaders.value = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    csvRows.value = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      csvHeaders.value.forEach((h, i) => {
        row[h] = values[i] || '';
      });
      return row;
    });

    const knownFields = new Set([
      'first_name', 'last_name', 'email', 'prefix', 'phone',
      'title', 'company', 'industry', 'website',
      'mailing_address', 'timezone', 'tags', 'notes',
    ]);
    const mapping: Record<string, string> = {};
    for (const header of csvHeaders.value) {
      const normalized = header.toLowerCase().replace(/\s+/g, '_');
      if (knownFields.has(normalized)) {
        mapping[header] = normalized;
      } else {
        mapping[header] = 'custom_field';
      }
    }
    columnMapping.value = mapping;
    currentStep.value = 1;
  };
  reader.readAsText(file);
}

async function runImport() {
  if (!csvFile.value) return;
  importing.value = true;

  if (!selectedOrg.value) {
    importing.value = false;
    importResult.value = {
      total: csvRows.value.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ row: 0, email: '', reason: 'No organization selected' }],
    };
    currentStep.value = 3;
    return;
  }

  const formData = new FormData();
  formData.append('file', csvFile.value);
  formData.append('organization_id', selectedOrg.value);
  if (targetListId.value) {
    formData.append('list_id', String(targetListId.value));
  }
  formData.append('update_existing', String(updateExisting.value));

  try {
    const result = await $fetch<CsvImportResult>('/api/contacts/import', {
      method: 'POST',
      body: formData,
    });
    importResult.value = result as any;
    currentStep.value = 3;
  } catch (err: any) {
    importResult.value = {
      total: csvRows.value.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [{ row: 0, email: '', reason: err.message || 'Import failed' }],
    };
    currentStep.value = 3;
  } finally {
    importing.value = false;
  }
}

function resetWizard() {
  currentStep.value = 0;
  csvFile.value = null;
  csvRows.value = [];
  csvHeaders.value = [];
  importResult.value = null;
}
</script>

<template>
  <AppSlideOverShell
    title="Import Contacts"
    subtitle="Upload a CSV, map its columns, and add new contacts to your audience."
    :flip-from="flipFrom"
    @close="emit('close')"
  >
    <!-- Step indicator -->
    <div class="flex flex-wrap gap-2 mb-6">
      <div
        v-for="(step, i) in steps"
        :key="i"
        class="flex items-center gap-2 text-xs"
        :class="currentStep >= i ? 'text-foreground font-medium' : 'text-muted-foreground'"
      >
        <span
          class="w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
          :class="currentStep >= i ? 'bg-primary text-primary-foreground' : 'bg-muted'"
        >
          {{ i + 1 }}
        </span>
        {{ step }}
        <Icon v-if="i < steps.length - 1" name="lucide:chevron-right" class="w-3.5 h-3.5 text-muted-foreground" />
      </div>
    </div>

    <!-- Step 0: Upload -->
    <div v-if="currentStep === 0">
      <div
        class="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 transition-colors"
        @dragover.prevent
        @drop.prevent="handleDrop"
        @click="fileInput?.click()"
      >
        <Icon name="lucide:upload-cloud" class="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
        <p class="text-base text-muted-foreground">Drop CSV file here or click to upload</p>
        <p class="text-xs text-muted-foreground/60 mt-1">Required columns: first_name, last_name, email</p>
      </div>
      <input ref="fileInput" type="file" accept=".csv" class="hidden" @change="handleFile" />

      <div class="mt-4">
        <Button variant="outline" size="sm" @click="downloadTemplate">
          <Icon name="lucide:download" class="w-4 h-4 mr-1" />
          Download Template
        </Button>
      </div>

      <div class="mt-6 p-4 bg-muted/50 rounded-lg text-sm">
        <p class="font-medium mb-2">Expected CSV format:</p>
        <pre class="text-xs text-muted-foreground overflow-x-auto font-mono">first_name,last_name,email,title,company,industry,mailing_address,tags
Jane,Smith,jane@acme.com,CEO,Acme Corp,Technology,"123 Main St, Miami FL 33101","vip,enterprise"</pre>
        <p class="mt-2 text-muted-foreground/80">
          Any extra columns not in the standard list are saved as custom_fields.
        </p>
      </div>
    </div>

    <!-- Step 1: Column mapping -->
    <div v-if="currentStep === 1">
      <p class="text-muted-foreground mb-4 text-sm">
        Map your CSV columns to contact fields. Auto-mapped columns are marked.
      </p>
      <CsvColumnMapper :headers="csvHeaders" v-model="columnMapping" />
      <div class="mt-6 space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1">Add to mailing list (optional)</label>
          <select v-model="targetListId" class="rounded-full glass-field px-3 py-2 text-sm w-full">
            <option :value="null">-- No list --</option>
            <option v-for="list in lists" :key="list.id" :value="list.id">{{ list.name }}</option>
          </select>
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="updateExisting" type="checkbox" class="accent-primary" />
          Update existing contacts if email already exists
        </label>
      </div>
    </div>

    <!-- Step 2: Preview -->
    <div v-if="currentStep === 2">
      <p class="text-muted-foreground mb-4 text-sm">
        Previewing first 5 rows. {{ csvRows.length }} total rows to import.
      </p>
      <div class="overflow-x-auto border rounded-lg">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-muted/50">
              <th v-for="h in previewHeaders" :key="h" class="p-2 border-b text-left font-medium text-xs">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in previewRows" :key="i" class="border-b last:border-0">
              <td v-for="h in previewHeaders" :key="h" class="p-2 text-xs">{{ row[h] || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Step 3: Result -->
    <div v-if="currentStep === 3 && importResult">
      <ImportResultSummary :result="importResult" />
    </div>

    <template #footer>
      <div v-if="currentStep === 0" class="flex justify-end">
        <Button variant="outline" size="sm" @click="emit('close')">Cancel</Button>
      </div>
      <div v-else-if="currentStep > 0 && currentStep < 3" class="flex justify-between">
        <Button variant="outline" size="sm" @click="currentStep--">Back</Button>
        <Button v-if="currentStep < 2" size="sm" :disabled="!canProceed" @click="currentStep++">
          Continue
        </Button>
        <Button v-else size="sm" :disabled="importing" @click="runImport">
          {{ importing ? `Importing ${csvRows.length} contacts...` : `Import ${csvRows.length} Contacts` }}
        </Button>
      </div>
      <div v-else-if="currentStep === 3" class="flex justify-between gap-2">
        <Button variant="outline" size="sm" @click="resetWizard">Import More</Button>
        <Button size="sm" @click="emit('close')">Done</Button>
      </div>
    </template>
  </AppSlideOverShell>
</template>
