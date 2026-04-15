<template>
  <form @submit.prevent="handleSubmit" class="space-y-5">
    <!-- Row 1: Client (primary billing target) -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Client *</label>
        <select v-model="formData.client" required class="w-full rounded-md border bg-background px-3 py-2 text-sm">
          <option :value="null" disabled>Select client...</option>
          <option v-for="c in clientOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Organization</label>
        <input
          :value="currentOrg?.name || orgs.find(o => o.id === formData.bill_to)?.name || '—'"
          disabled
          class="w-full rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
        />
      </div>
    </div>

    <!-- Row 2: Invoice Code + Project -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Invoice Code</label>
        <input
          v-model="formData.invoice_code"
          disabled
          class="w-full rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
          placeholder="Auto-generated"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Projects</label>
        <div
          class="w-full rounded-md border bg-background px-3 py-2 text-sm space-y-1.5 max-h-32 overflow-y-auto"
          :class="{ 'opacity-50 pointer-events-none': !formData.client }"
        >
          <template v-if="!formData.client">
            <p class="text-muted-foreground text-xs">Select a client first</p>
          </template>
          <template v-else-if="!clientProjects.length">
            <p class="text-muted-foreground text-xs">No active projects for this client</p>
          </template>
          <template v-else>
            <label
              v-for="p in clientProjects"
              :key="p.id"
              class="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
            >
              <input
                type="checkbox"
                :value="p.id"
                v-model="formData.projects"
                class="rounded border-gray-300 text-primary focus:ring-primary/50"
              />
              <span class="truncate">{{ p.title }}</span>
            </label>
          </template>
        </div>
      </div>
    </div>

    <!-- Row 3: Dates -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Invoice Date *</label>
        <input
          v-model="formData.invoice_date"
          type="date"
          required
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Due Date *</label>
        <input
          v-model="formData.due_date"
          type="date"
          required
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
    </div>

    <!-- Status + Melio -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Status</label>
        <select v-model="formData.status" class="w-full rounded-md border bg-background px-3 py-2 text-sm">
          <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Melio Link</label>
        <input
          v-model="formData.melio"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="https://app.meliopayments.com/..."
        />
      </div>
    </div>

    <!-- Check / Mailing -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Date Mailed</label>
        <input
          v-model="formData.date_mailed"
          type="date"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Check Image</label>
        <div v-if="checkImagePreview" class="mb-2 flex items-center gap-2">
          <a :href="checkImagePreview" target="_blank" class="flex items-center gap-2 text-xs text-primary hover:underline">
            <img :src="checkImagePreview" alt="Check" class="h-10 w-16 object-cover rounded border" />
            <span>{{ checkImageFilename || 'View' }}</span>
          </a>
          <button type="button" class="text-xs text-destructive hover:underline" @click="removeCheckImage">Remove</button>
        </div>
        <input
          type="file"
          accept="image/*"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm file:mr-2 file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:text-primary"
          @change="handleCheckImageUpload"
        />
      </div>
    </div>

    <!-- Note -->
    <div>
      <label class="block text-sm font-medium mb-1">Note</label>
      <textarea
        v-model="formData.note"
        rows="2"
        class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="Note visible on the invoice..."
      />
    </div>

    <!-- Memo -->
    <div>
      <label class="block text-sm font-medium mb-1">Internal Memo</label>
      <textarea
        v-model="formData.memo"
        rows="2"
        class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="Internal memo (not shown to client)..."
      />
    </div>

    <!-- Billing Contact Details -->
    <div class="border-t pt-4 mt-2">
      <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
        <Icon name="lucide:contact" class="w-4 h-4 text-muted-foreground" />
        Billing Contacts
      </h3>
      <p class="text-xs text-muted-foreground mb-3">Select recipients for this invoice. First selected = primary (TO), others = CC.</p>

      <!-- Multi-select billing contacts -->
      <div v-if="availableBillingContacts.length > 0" class="space-y-1.5 mb-3">
        <label
          v-for="(contact, i) in availableBillingContacts"
          :key="i"
          class="flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors"
          :class="selectedContactEmails.has(contact.email) ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40'"
        >
          <input
            type="checkbox"
            :checked="selectedContactEmails.has(contact.email)"
            class="rounded border-border"
            @change="toggleBillingContact(contact)"
          />
          <div class="flex-1 min-w-0">
            <span class="text-sm font-medium">{{ contact.name || 'Unnamed' }}</span>
            <span class="text-xs text-muted-foreground ml-1.5">{{ contact.email }}</span>
          </div>
          <span
            v-if="selectedContactEmails.has(contact.email)"
            class="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0"
            :class="contact.email === formData.billing_email ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'"
          >
            {{ contact.email === formData.billing_email ? 'TO' : 'CC' }}
          </span>
        </label>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Billing Name</label>
          <input
            v-model="formData.billing_name"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Contact name"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Billing Email</label>
          <input
            v-model="formData.billing_email"
            type="email"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="billing@example.com"
          />
        </div>
      </div>
      <div class="mt-3">
        <label class="block text-sm font-medium mb-1">Billing Address</label>
        <input
          v-model="formData.billing_address"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Billing address"
        />
      </div>
    </div>

    <!-- CC / Additional Recipients -->
    <div>
      <label class="block text-sm font-medium mb-1">Email Recipients (CC)</label>
      <div class="flex flex-wrap gap-1.5 min-h-[38px] w-full rounded-md border bg-background px-3 py-2 text-sm items-center">
        <span
          v-for="(email, i) in ccEmails"
          :key="i"
          class="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs"
        >
          {{ email }}
          <button type="button" class="hover:text-destructive" @click="removeCcEmail(i)">
            <Icon name="lucide:x" class="w-3 h-3" />
          </button>
        </span>
        <input
          v-model="ccInput"
          class="flex-1 min-w-[160px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          placeholder="Add email and press Enter..."
          @keydown.enter.prevent="addCcEmail"
          @keydown.tab.prevent="addCcEmail"
          @blur="addCcEmail"
        />
      </div>
      <p class="text-[10px] text-muted-foreground mt-0.5">Additional people to CC when the invoice is sent</p>
    </div>

    <!-- Line Items -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <label class="text-sm font-medium">Line Items *</label>
        <Button type="button" variant="outline" size="sm" @click="addLineItem">
          <Icon name="lucide:plus" class="w-3.5 h-3.5 mr-1" />
          Add Item
        </Button>
      </div>

      <div v-if="lineItems.length" class="space-y-2">
        <!-- Header -->
        <div class="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1">
          <span class="col-span-3">Product</span>
          <span class="col-span-3">Description</span>
          <span class="col-span-2">Qty</span>
          <span class="col-span-2">Rate</span>
          <span class="col-span-2 text-right">Amount</span>
        </div>

        <InvoicesLineItemRow
          v-for="(item, index) in lineItems"
          :key="item._key"
          :line-item="item"
          :products="productsList"
          :index="index"
          @update="updateLineItem"
          @remove="removeLineItem"
        />

        <!-- Total -->
        <div class="flex justify-end pt-3 border-t border-border">
          <div class="text-sm font-medium">
            Total: <span class="ml-2">${{ formatAmount(computedTotal) }}</span>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg">
        No line items yet. Click "Add Item" to get started.
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" @click="$emit('cancel')">Cancel</Button>
      <Button type="submit" :disabled="saving || !lineItems.length">
        {{ saving ? 'Saving...' : (invoice ? 'Update Invoice' : 'Create Invoice') }}
      </Button>
    </div>
  </form>
</template>

<script setup lang="ts">
import type { Invoice, Product } from '~~/shared/directus';
import type { LineItemFormData } from '~/components/Invoices/LineItemRow.vue';
import { Button } from '~/components/ui/button';

const props = defineProps<{
  invoice?: Invoice | null;
  saving?: boolean;
  defaults?: { projects?: string[]; bill_to?: string | null; client?: string | null } | null;
}>();

const emit = defineEmits<{
  save: [data: any];
  cancel: [];
}>();

const statusOptions = [
  { label: 'Pending', value: 'pending' },
  { label: 'Processing', value: 'processing' },
  { label: 'Paid', value: 'paid' },
  { label: 'Archived', value: 'archived' },
];

// --- Fetch dropdown data ---
const { organizations, selectedOrg, currentOrg } = useOrganization();
const { getClientOptions, getClients } = useClients();
const { getProducts, generateInvoiceCode } = useInvoices();
const { upload: uploadFile, getUrl: getFileUrl } = useDirectusFiles();
const { getOrgSubfolder } = useOrgFolders();
const projectItems = useDirectusItems('projects');

const orgs = computed(() => organizations.value || []);
const clientOptions = ref<{ label: string; value: string }[]>([]);
const clientProjects = ref<any[]>([]);
const productsList = ref<Product[]>([]);

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

function extractId(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val;
  return val.id || null;
}

function extractProjectIds(invoice: any): string[] {
  if (!invoice?.projects?.length) return [];
  return invoice.projects
    .map((j: any) => typeof j === 'string' ? j : (j.projects_id?.id || j.projects_id || null))
    .filter(Boolean);
}

// --- Form state ---
const formData = reactive({
  bill_to: extractId(props.invoice?.bill_to) || props.defaults?.bill_to || selectedOrg.value || '',
  client: extractId(props.invoice?.client) || props.defaults?.client || null,
  projects: extractProjectIds(props.invoice).length
    ? extractProjectIds(props.invoice)
    : (props.defaults?.projects || []),
  invoice_code: props.invoice?.invoice_code || '',
  invoice_date: props.invoice?.invoice_date?.split('T')[0] || todayString(),
  due_date: props.invoice?.due_date?.split('T')[0] || '',
  status: props.invoice?.status || 'pending',
  note: props.invoice?.note || '',
  memo: props.invoice?.memo || '',
  melio: props.invoice?.melio || '',
  date_mailed: props.invoice?.date_mailed?.split('T')[0] || '',
  check_image: extractId(props.invoice?.check_image) || null,
  billing_name: props.invoice?.billing_name || '',
  billing_email: props.invoice?.billing_email || '',
  billing_address: props.invoice?.billing_address || '',
});

// --- CC emails state ---
const ccEmails = ref<string[]>(
  Array.isArray(props.invoice?.emails) ? [...props.invoice.emails] : []
);
const ccInput = ref('');

function addCcEmail() {
  const raw = ccInput.value.trim().toLowerCase();
  if (!raw) return;
  // Support comma/semicolon-separated paste
  const parts = raw.split(/[,;\s]+/).filter(Boolean);
  for (const part of parts) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part) && !ccEmails.value.includes(part)) {
      ccEmails.value.push(part);
    }
  }
  ccInput.value = '';
}

function removeCcEmail(index: number) {
  ccEmails.value.splice(index, 1);
}

// --- Check image ---
const checkImagePreview = computed(() => {
  if (!formData.check_image) return null;
  return getFileUrl(formData.check_image, { width: 200, format: 'webp' });
});

const checkImageFilename = computed(() => {
  const ci = props.invoice?.check_image;
  if (ci && typeof ci === 'object' && 'filename_download' in ci) return ci.filename_download;
  return null;
});

async function handleCheckImageUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const folder = await getOrgSubfolder('Financials');
    const uploaded = await uploadFile(file, { title: `Check - ${formData.invoice_code || 'invoice'}`, ...(folder && { folder }) });
    formData.check_image = (uploaded as any)?.id || null;
  } catch (err) {
    console.warn('Check image upload failed:', err);
  }
}

function removeCheckImage() {
  formData.check_image = null;
}

// --- Line items state ---
let keyCounter = 0;

interface LineItemWithKey extends LineItemFormData {
  _key: number;
}

const lineItems = ref<LineItemWithKey[]>([]);
const removedLineItemIds = ref<string[]>([]);

// Initialize from existing invoice
function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

if (props.invoice?.line_items?.length) {
  lineItems.value = (props.invoice.line_items as any[]).map(li => ({
    _key: keyCounter++,
    id: li.id,
    product: typeof li.product === 'string' ? li.product : li.product?.id || '',
    quantity: li.quantity ?? 1,
    rate: li.rate ?? 0,
    description: stripHtml(li.description || ''),
    _isNew: false,
  }));
}

function addLineItem() {
  lineItems.value.push({
    _key: keyCounter++,
    product: '',
    quantity: 1,
    rate: 0,
    description: '',
    _isNew: true,
  });
}

function updateLineItem(index: number, data: Partial<LineItemFormData>) {
  Object.assign(lineItems.value[index], data);
}

function removeLineItem(index: number) {
  const item = lineItems.value[index];
  if (item.id && !item._isNew) {
    removedLineItemIds.value.push(item.id);
  }
  lineItems.value.splice(index, 1);
}

const computedTotal = computed(() => {
  return lineItems.value.reduce((sum, li) => sum + (li.quantity || 0) * (li.rate || 0), 0);
});

function formatAmount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function handleSubmit() {
  const payload: any = {
    bill_to: formData.bill_to || undefined,
    invoice_code: formData.invoice_code || undefined,
    invoice_date: formData.invoice_date,
    due_date: formData.due_date,
    status: formData.status,
    note: formData.note || undefined,
    memo: formData.memo || undefined,
    melio: formData.melio || undefined,
    date_mailed: formData.date_mailed || null,
    check_image: formData.check_image || null,
    billing_name: formData.billing_name || undefined,
    billing_email: formData.billing_email || undefined,
    billing_address: formData.billing_address || undefined,
    client: formData.client || undefined,
    projects: formData.projects.length
      ? formData.projects.map((id: string) => ({ projects_id: id }))
      : [],
    emails: ccEmails.value.length ? ccEmails.value : [],
    total_amount: computedTotal.value,
  };

  if (props.invoice) {
    // Edit mode: use Directus nested mutation syntax
    const lineItemPayload: any = {};
    const newItems = lineItems.value.filter(li => li._isNew);
    const existingItems = lineItems.value.filter(li => !li._isNew && li.id);

    if (newItems.length) {
      lineItemPayload.create = newItems.map(li => ({
        product: li.product,
        quantity: li.quantity,
        rate: li.rate,
        description: li.description || undefined,
      }));
    }
    if (existingItems.length) {
      lineItemPayload.update = existingItems.map(li => ({
        id: li.id,
        product: li.product,
        quantity: li.quantity,
        rate: li.rate,
        description: li.description || undefined,
      }));
    }
    if (removedLineItemIds.value.length) {
      lineItemPayload.delete = removedLineItemIds.value;
    }

    if (Object.keys(lineItemPayload).length) {
      payload.line_items = lineItemPayload;
    }
  } else {
    // Create mode
    payload.line_items = {
      create: lineItems.value.map(li => ({
        product: li.product,
        quantity: li.quantity,
        rate: li.rate,
        description: li.description || undefined,
      })),
    };
  }

  emit('save', payload);
}

// --- Auto-generate invoice code when client or invoice_date changes (new invoices only) ---
const autoGenerateCode = async () => {
  if (!formData.client || props.invoice) return; // Only for new invoices
  try {
    const code = await generateInvoiceCode(formData.client, formData.invoice_date, formData.bill_to || undefined);
    if (code) {
      formData.invoice_code = code;
    }
  } catch (e) {
    // Silently fail — user can still enter manually
  }
};

// Auto-derive bill_to and billing contact from client's organization
const clientLookup = ref<Map<string, string>>(new Map());
const clientBillingLookup = ref<Map<string, { billing_name?: string; billing_email?: string; billing_address?: string; billing_contacts?: Array<{ name: string; email: string }> }>>(new Map());

// Billing contact multi-select — shows client's billing_contacts for picking
const availableBillingContacts = computed(() => {
  if (!formData.client) return [];
  const billing = clientBillingLookup.value.get(formData.client);
  return billing?.billing_contacts?.filter(c => c.email?.trim()) || [];
});

// Track which contacts are selected (by email)
const selectedContactEmails = computed(() => {
  const selected = new Set<string>();
  // Primary is always selected
  if (formData.billing_email) selected.add(formData.billing_email);
  // CC'd contacts from billing_contacts are also selected
  for (const contact of availableBillingContacts.value) {
    if (ccEmails.value.includes(contact.email)) selected.add(contact.email);
  }
  return selected;
});

function toggleBillingContact(contact: { name: string; email: string }) {
  const email = contact.email.trim();
  if (!email) return;

  if (selectedContactEmails.value.has(email)) {
    // Deselecting — remove from primary or CC
    if (formData.billing_email === email) {
      // Deselecting primary: promote next selected CC contact to primary, or clear
      const nextCc = availableBillingContacts.value.find(
        c => c.email !== email && ccEmails.value.includes(c.email)
      );
      if (nextCc) {
        formData.billing_email = nextCc.email;
        formData.billing_name = nextCc.name || '';
        ccEmails.value = ccEmails.value.filter(e => e !== nextCc.email);
      } else {
        formData.billing_email = '';
        formData.billing_name = '';
      }
    } else {
      // Deselecting a CC contact
      ccEmails.value = ccEmails.value.filter(e => e !== email);
    }
  } else {
    // Selecting — if no primary yet, set as primary; otherwise add to CC
    if (!formData.billing_email) {
      formData.billing_email = email;
      formData.billing_name = contact.name || '';
    } else {
      if (!ccEmails.value.includes(email)) {
        ccEmails.value.push(email);
      }
    }
  }
}

watch(() => formData.client, (clientId) => {
  autoGenerateCode();
  if (clientId && clientLookup.value.has(clientId)) {
    formData.bill_to = clientLookup.value.get(clientId) || '';
  }
  // Auto-populate billing fields from client — select all billing contacts
  if (clientId && !props.invoice && clientBillingLookup.value.has(clientId)) {
    // Reset billing fields and CC emails before populating from new client
    ccEmails.value = [];
    const billing = clientBillingLookup.value.get(clientId)!;
    const contacts = billing.billing_contacts?.filter(c => c.email?.trim()) || [];
    if (contacts.length > 0) {
      // First contact = primary (TO)
      formData.billing_email = contacts[0].email;
      formData.billing_name = contacts[0].name || '';
      // Remaining contacts = CC
      ccEmails.value = contacts.slice(1).map(c => c.email);
    } else {
      formData.billing_email = billing.billing_email || '';
      formData.billing_name = billing.billing_name || '';
    }
    formData.billing_address = billing.billing_address || '';
  }
});
watch(() => formData.invoice_date, autoGenerateCode);

// --- Fetch projects for the selected client (Scheduled / Active only) ---
async function fetchClientProjects(clientId: string | null) {
  if (!clientId) {
    clientProjects.value = [];
    return;
  }
  try {
    const projs = await projectItems.list({
      fields: ['id', 'title'],
      filter: {
        client: { _eq: clientId },
      },
      sort: ['title'],
      limit: 200,
    });
    clientProjects.value = projs;
  } catch {
    clientProjects.value = [];
  }
}

watch(() => formData.client, (clientId, oldClientId) => {
  // Only clear selections when the user changes the client, not on initial load
  if (oldClientId !== undefined) {
    formData.projects = [];
  }
  fetchClientProjects(clientId);
}, { immediate: true });

// --- Fetch dropdown data on mount ---
onMounted(async () => {
  try {
    const [clientOpts, allClients, prods] = await Promise.all([
      getClientOptions(),
      getClients({ limit: 500 }),
      getProducts(),
    ]);
    clientOptions.value = clientOpts;
    productsList.value = prods;

    // Build client → organization and billing lookups
    // For sub-brands with no billing details, fall back to parent_client
    const clientList = Array.isArray(allClients) ? allClients : allClients?.data || [];
    // First pass: index all clients
    const clientMap = new Map<string, any>();
    for (const c of clientList) {
      clientMap.set(c.id, c);
    }
    for (const c of clientList) {
      const orgId = typeof c.organization === 'object' ? c.organization?.id : c.organization;
      if (orgId) clientLookup.value.set(c.id, orgId);

      const hasBilling = c.billing_email || (Array.isArray(c.billing_contacts) && c.billing_contacts.some((bc: any) => bc.email?.trim()));
      const parentId = typeof c.parent_client === 'object' ? c.parent_client?.id : c.parent_client;
      const parent = parentId ? clientMap.get(parentId) : null;

      // Use client's own billing if present, otherwise fall back to parent
      const source = hasBilling ? c : (parent || c);

      // For org lookup: sub-brands without their own org inherit from parent
      if (!orgId && parent) {
        const parentOrgId = typeof parent.organization === 'object' ? parent.organization?.id : parent.organization;
        if (parentOrgId) clientLookup.value.set(c.id, parentOrgId);
      }

      clientBillingLookup.value.set(c.id, {
        billing_name: source.billing_name || undefined,
        billing_email: source.billing_email || undefined,
        billing_address: source.billing_address || undefined,
        billing_contacts: source.billing_contacts || undefined,
      });
    }

    // Auto-set bill_to and billing info if client is already selected (from defaults or edit mode)
    if (formData.client && clientLookup.value.has(formData.client)) {
      formData.bill_to = clientLookup.value.get(formData.client) || formData.bill_to;

      // Auto-populate billing fields if this is a new invoice (not editing)
      if (!props.invoice && clientBillingLookup.value.has(formData.client)) {
        const billing = clientBillingLookup.value.get(formData.client)!;
        const contacts = billing.billing_contacts?.filter(c => c.email?.trim()) || [];
        if (contacts.length > 0) {
          formData.billing_email = contacts[0].email;
          formData.billing_name = contacts[0].name || '';
          const extraEmails = contacts.slice(1).map(c => c.email);
          for (const email of extraEmails) {
            if (!ccEmails.value.includes(email)) ccEmails.value.push(email);
          }
        } else {
          formData.billing_email = billing.billing_email || '';
          formData.billing_name = billing.billing_name || '';
        }
        formData.billing_address = billing.billing_address || '';
      }

      // Auto-generate invoice code
      autoGenerateCode();
    }
  } catch (err) {
    console.error('Failed to load form data:', err);
  }
});
</script>
