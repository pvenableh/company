<script setup lang="ts">
import type { CsvImportResult, MailingList } from '~/types/email/contacts';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Import Contacts | Earnest' });

const { getLists } = useMailingLists();
const { downloadTemplate } = useCsvTemplate();

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

    // Auto-map columns
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

  const formData = new FormData();
  formData.append('file', csvFile.value);
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
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto">
    <div class="flex items-center gap-3 mb-6">
      <NuxtLink to="/contacts" class="text-muted-foreground hover:text-foreground">
        <Icon name="lucide:arrow-left" class="w-5 h-5" />
      </NuxtLink>
      <h1 class="text-xl font-semibold">Import Contacts from CSV</h1>
    </div>

    <!-- Step indicator -->
    <div class="flex gap-2 mb-8">
      <div
        v-for="(step, i) in steps"
        :key="i"
        class="flex items-center gap-2 text-sm"
        :class="currentStep >= i ? 'text-foreground font-medium' : 'text-muted-foreground'"
      >
        <span
          class="w-6 h-6 rounded-full flex items-center justify-center text-xs"
          :class="currentStep >= i ? 'bg-primary text-primary-foreground' : 'bg-muted'"
        >
          {{ i + 1 }}
        </span>
        {{ step }}
        <Icon v-if="i < steps.length - 1" name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground" />
      </div>
    </div>

    <!-- Step 0: Upload -->
    <div v-if="currentStep === 0">
      <div
        class="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
        @dragover.prevent
        @drop.prevent="handleDrop"
        @click="fileInput?.click()"
      >
        <Icon name="lucide:upload-cloud" class="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
        <p class="text-lg text-muted-foreground">Drop CSV file here or click to upload</p>
        <p class="text-sm text-muted-foreground/60 mt-1">Required columns: first_name, last_name, email</p>
      </div>
      <input ref="fileInput" type="file" accept=".csv" class="hidden" @change="handleFile" />

      <div class="mt-4 flex justify-between items-center">
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
          <select v-model="targetListId" class="rounded-md border bg-background px-3 py-2 text-sm w-full">
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
      <div class="mt-6 flex gap-2">
        <NuxtLink to="/contacts">
          <Button>View Contacts</Button>
        </NuxtLink>
        <Button variant="outline" @click="currentStep = 0; csvFile = null; csvRows = []; csvHeaders = []">
          Import More
        </Button>
      </div>
    </div>

    <!-- Navigation -->
    <div class="flex justify-between mt-8" v-if="currentStep > 0 && currentStep < 3">
      <Button variant="outline" @click="currentStep--">Back</Button>
      <Button v-if="currentStep < 2" :disabled="!canProceed" @click="currentStep++">
        Continue
      </Button>
      <Button v-if="currentStep === 2" :disabled="importing" @click="runImport">
        {{ importing ? `Importing ${csvRows.length} contacts...` : `Import ${csvRows.length} Contacts` }}
      </Button>
    </div>
  </div>
</template>
