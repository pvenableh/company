<template>
  <form @submit.prevent="handleSubmit" class="space-y-4">
    <div class="space-y-1">
      <label class="t-label text-muted-foreground">Name *</label>
      <UInput v-model="formData.name" required placeholder="Client name" />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Slug</label>
        <UInput v-model="formData.slug" readonly placeholder="auto-generated from name" />
      </div>
      <div v-if="!isEditing" class="space-y-1">
        <label class="t-label text-muted-foreground">Account State</label>
        <select
          v-model="accountStateModel"
          class="w-full rounded-full border bg-background px-3 py-2 text-sm"
        >
          <option v-for="s in accountStateOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Website</label>
        <UInput v-model="formData.website" placeholder="https://" />
      </div>
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Industry</label>
        <select
          v-model="formData.industry"
          class="w-full rounded-full border bg-background px-3 py-2 text-sm"
        >
          <option value="">Select industry...</option>
          <option v-for="ind in industries" :key="ind.id" :value="ind.id">{{ ind.name }}</option>
        </select>
      </div>
    </div>

    <div class="space-y-1">
      <label class="t-label text-muted-foreground">Parent Client</label>
      <p class="text-xs text-muted-foreground">If this is a sub-brand, select its parent. Billing info inherits from the parent when not set here.</p>
      <select
        v-model="formData.parent_client"
        class="w-full rounded-full border bg-background px-3 py-2 text-sm mt-1"
      >
        <option value="">None (top-level client)</option>
        <option v-for="opt in parentClientOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
    </div>

    <div class="space-y-1">
      <label class="t-label text-muted-foreground">Tags</label>
      <div class="flex flex-wrap items-center gap-1.5">
        <span
          v-for="tag in formData.tags"
          :key="tag"
          class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
        >
          {{ tag }}
          <button type="button" class="text-muted-foreground hover:text-destructive" @click="removeTag(tag)">
            <Icon name="lucide:x" class="h-3 w-3" />
          </button>
        </span>
        <UInput
          v-model="newTag"
          size="xs"
          class="w-28"
          placeholder="Add tag"
          @keydown.enter.prevent="addTag"
          @keydown.,.prevent="addTag"
          @blur="addTag"
        />
      </div>
    </div>

    <!-- Billing Contacts -->
    <div class="space-y-1">
      <label class="t-label text-muted-foreground">Billing Contacts</label>
      <p class="text-xs text-muted-foreground">Invoice recipients — these emails receive payment links and invoice notifications.</p>
      <div class="space-y-2 pt-1">
        <div
          v-for="(contact, i) in formData.billing_contacts"
          :key="i"
          class="flex gap-2 items-center"
        >
          <UInput v-model="contact.name" class="flex-1" placeholder="Name" />
          <UInput v-model="contact.email" type="email" class="flex-1" placeholder="email@example.com" />
          <button
            type="button"
            class="p-1.5 text-muted-foreground/40 hover:text-destructive transition-colors"
            @click="formData.billing_contacts.splice(i, 1)"
          >
            <Icon name="lucide:trash-2" class="w-4 h-4" />
          </button>
        </div>
      </div>
      <div class="pt-1 flex flex-wrap items-center gap-2 relative">
        <Button
          type="button"
          variant="outline"
          size="sm"
          @click="formData.billing_contacts.push({ name: '', email: '' })"
        >
          <Icon name="lucide:plus" class="w-3 h-3 mr-1" />
          Add Contact
        </Button>
        <Button
          v-if="isEditing"
          type="button"
          variant="ghost"
          size="sm"
          @click="togglePicker"
        >
          <Icon name="lucide:users" class="w-3 h-3 mr-1" />
          Pick from existing
        </Button>

        <div
          v-if="showPicker"
          class="absolute left-0 top-full mt-1 z-30 w-full max-w-md rounded-xl border border-border bg-popover shadow-lg"
        >
          <div class="px-3 py-2 border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Connected contacts</span>
            <button type="button" class="text-muted-foreground/60 hover:text-foreground" @click="showPicker = false">
              <Icon name="lucide:x" class="w-3.5 h-3.5" />
            </button>
          </div>
          <div v-if="loadingPickerContacts" class="px-3 py-6 text-center text-xs text-muted-foreground">
            <Icon name="lucide:loader-2" class="w-4 h-4 animate-spin inline-block" />
          </div>
          <div v-else-if="!availablePickerContacts.length" class="px-3 py-6 text-center text-xs text-muted-foreground">
            No contacts with email on this client or its parent chain.
          </div>
          <div v-else class="max-h-[280px] overflow-y-auto">
            <button
              v-for="c in availablePickerContacts"
              :key="c.id"
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/40 border-b border-border/30 last:border-b-0 text-left"
              @click="addContactFromPicker(c)"
            >
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{{ c.first_name }} {{ c.last_name }}</p>
                <p class="text-[11px] text-muted-foreground truncate">{{ c.email }}</p>
              </div>
              <span
                v-if="c.source === 'parent'"
                class="text-[9px] uppercase tracking-wider text-muted-foreground/70 shrink-0"
                :title="`From ${c.fromName || 'parent client'}`"
              >
                from {{ c.fromName }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="space-y-1">
      <label class="t-label text-muted-foreground">Address</label>
      <UTextarea v-model="formData.billing_address" :rows="2" placeholder="Street address, city, state, zip..." />
    </div>

    <div class="space-y-1">
      <label class="t-label text-muted-foreground">Notes</label>
      <UTextarea v-model="formData.notes" :rows="3" placeholder="Internal notes about this client..." />
    </div>

    <!-- Brand & Strategy (edit-only — BrandAIFieldSuggest needs an entity id) -->
    <div v-if="isEditing" class="border-t pt-4 mt-2">
      <h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
        <Icon name="lucide:palette" class="w-4 h-4 text-muted-foreground" />
        Brand & Strategy
      </h3>

      <div class="space-y-4">
        <BrandAIFieldSuggest
          v-model="formData.brand_direction"
          label="Brand Direction"
          field="brand_direction"
          placeholder="Brand positioning, voice, visual style, and messaging strategy..."
          entity-type="client"
          :entity-id="client!.id"
          :organization-id="typeof client!.organization === 'string' ? client!.organization : (client!.organization as any)?.id || ''"
        />

        <BrandAIFieldSuggest
          v-model="formData.goals"
          label="Goals"
          field="goals"
          placeholder="Business goals and objectives..."
          entity-type="client"
          :entity-id="client!.id"
          :organization-id="typeof client!.organization === 'string' ? client!.organization : (client!.organization as any)?.id || ''"
        />

        <BrandAIFieldSuggest
          v-model="formData.target_audience"
          label="Target Audience"
          field="target_audience"
          placeholder="Ideal customer profile, demographics, psychographics..."
          entity-type="client"
          :entity-id="client!.id"
          :organization-id="typeof client!.organization === 'string' ? client!.organization : (client!.organization as any)?.id || ''"
        />

        <div class="space-y-1">
          <label class="t-label text-muted-foreground">Location</label>
          <UInput v-model="formData.location" placeholder="City, region, or Remote/Global" />
        </div>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import type { Client } from '~~/shared/directus';
import { Button } from '~/components/ui/button';

const props = defineProps<{
  client?: Client | null;
  saving?: boolean;
}>();

const emit = defineEmits<{
  save: [data: Partial<Client>];
}>();

const accountStateModel = defineModel<string>('accountState', { default: 'active' });

const isEditing = computed(() => !!props.client?.id);

const accountStateOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Prospect', value: 'prospect' },
  { label: 'Inactive', value: 'inactive' },
];

const industryItems = useDirectusItems('industries');
const industries = ref<Array<{ id: string; name: string }>>([]);
const { getClientOptions } = useClients();
const { getAncestorClientIds } = useContactConnections();
const contactItemsApi = useDirectusItems('contacts');
const { selectedOrg } = useOrganization();
const parentClientOptions = ref<Array<{ label: string; value: string }>>([]);

const formData = reactive({
  name: props.client?.name || '',
  slug: props.client?.slug || '',
  website: props.client?.website || '',
  industry: (typeof props.client?.industry === 'object' ? (props.client?.industry as any)?.id : props.client?.industry) || '',
  parent_client: (typeof props.client?.parent_client === 'object' ? (props.client?.parent_client as any)?.id : props.client?.parent_client) || '',
  notes: props.client?.notes || '',
  tags: [...(props.client?.tags || [])] as string[],
  billing_contacts: [...(props.client?.billing_contacts || [])] as { name: string; email: string }[],
  billing_address: props.client?.billing_address || '',
  brand_direction: props.client?.brand_direction || '',
  goals: props.client?.goals || '',
  target_audience: props.client?.target_audience || '',
  location: props.client?.location || '',
});

// Initialize account_state model from client on mount (owned by parent via defineModel).
if ((props.client as any)?.account_state) {
  accountStateModel.value = (props.client as any).account_state;
}

// ── Billing-contact picker (existing client + parent-chain contacts) ────────
const showPicker = ref(false);
const loadingPickerContacts = ref(false);
type PickerContact = {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  source: 'self' | 'parent';
  fromName?: string;
};
const pickerContacts = ref<PickerContact[]>([]);

async function loadPickerContacts() {
  if (!props.client?.id) return;
  loadingPickerContacts.value = true;
  try {
    // Defense in depth — the contacts row-perm has a `user_created` fallback
    // that ignores the M2M org junction. Without an explicit organizations
    // filter, contacts the current user once created in another tenant could
    // surface in this picker.
    const orgFilterClause = selectedOrg.value
      ? [{ organizations: { organizations_id: { _eq: selectedOrg.value } } }]
      : [];
    const selfRows = (await contactItemsApi.list({
      fields: ['id', 'first_name', 'last_name', 'email'],
      filter: {
        _and: [
          { client: { _eq: props.client.id } },
          ...orgFilterClause,
        ],
      },
      limit: -1,
    })) as any[];

    const ancestors = await getAncestorClientIds(props.client.id, 3);
    const ancestorRows: PickerContact[] = [];
    for (const a of ancestors) {
      const rows = (await contactItemsApi.list({
        fields: ['id', 'first_name', 'last_name', 'email'],
        filter: {
          _and: [
            { client: { _eq: a.id } },
            ...orgFilterClause,
          ],
        },
        limit: -1,
      }).catch(() => [])) as any[];
      for (const r of rows) {
        ancestorRows.push({ ...r, source: 'parent', fromName: a.name });
      }
    }

    pickerContacts.value = [
      ...selfRows.map((r) => ({ ...r, source: 'self' as const })),
      ...ancestorRows,
    ];
  } catch (err) {
    console.error('[ClientForm] picker contact fetch failed:', err);
    pickerContacts.value = [];
  } finally {
    loadingPickerContacts.value = false;
  }
}

const availablePickerContacts = computed<PickerContact[]>(() => {
  const existingEmails = new Set(
    formData.billing_contacts
      .map((c) => (c.email || '').trim().toLowerCase())
      .filter(Boolean),
  );
  return pickerContacts.value.filter(
    (c) => c.email?.trim() && !existingEmails.has(c.email.trim().toLowerCase()),
  );
});

function togglePicker() {
  showPicker.value = !showPicker.value;
  if (showPicker.value && pickerContacts.value.length === 0) {
    loadPickerContacts();
  }
}

function addContactFromPicker(c: PickerContact) {
  const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
  formData.billing_contacts.push({
    name: name || c.email || '',
    email: c.email || '',
  });
  showPicker.value = false;
}

onMounted(async () => {
  try {
    industries.value = await industryItems.list({
      fields: ['id', 'name'],
      filter: { status: { _eq: 'published' } },
      sort: ['name'],
      limit: -1,
    }) as any;
  } catch { /* industries may not be accessible */ }

  try {
    const opts = await getClientOptions();
    // Exclude self to prevent self-parenting
    parentClientOptions.value = props.client?.id
      ? opts.filter(o => o.value !== props.client?.id)
      : opts;
  } catch { /* options may not be accessible */ }
});

const newTag = ref('');

// Auto-generate slug from name
function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

watch(() => formData.name, (newName) => {
  // Only auto-generate if slug is empty or was previously auto-generated
  if (!props.client?.slug || !formData.slug || formData.slug === slugify(props.client?.name || '')) {
    formData.slug = slugify(newName);
  }
});

function addTag() {
  const tag = newTag.value.trim().toLowerCase();
  if (tag && !formData.tags.includes(tag)) {
    formData.tags.push(tag);
  }
  newTag.value = '';
}

function removeTag(tag: string) {
  formData.tags = formData.tags.filter((t: string) => t !== tag);
}

function handleSubmit() {
  // Flush pending tag input
  if (newTag.value.trim()) addTag();

  const validContacts = formData.billing_contacts.filter(c => c.email?.trim());
  const primaryContact = validContacts[0];

  emit('save', {
    name: formData.name,
    slug: formData.slug || undefined,
    account_state: accountStateModel.value,
    website: formData.website || undefined,
    industry: formData.industry || undefined,
    parent_client: formData.parent_client || null,
    notes: formData.notes || undefined,
    tags: formData.tags.length ? formData.tags : undefined,
    billing_contacts: validContacts.length ? validContacts : undefined,
    // Keep billing_email/billing_name in sync with primary billing contact
    billing_email: primaryContact?.email?.trim() || undefined,
    billing_name: primaryContact?.name?.trim() || undefined,
    billing_address: formData.billing_address || undefined,
    brand_direction: formData.brand_direction || undefined,
    goals: formData.goals || undefined,
    target_audience: formData.target_audience || undefined,
    location: formData.location || undefined,
  });
}

defineExpose({
  triggerSubmit: handleSubmit,
  hasName: computed(() => !!formData.name.trim()),
});
</script>
