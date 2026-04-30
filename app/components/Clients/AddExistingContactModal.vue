<template>
  <UModal
    v-model="isOpen"
    title="Add Existing Contact"
    description="Search unattached contacts and link one to this client."
    :ui="{ content: 'max-w-lg' }"
  >
    <div class="space-y-3 mt-1">
      <div class="relative">
        <Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="Search by name, email, company..."
          class="w-full h-9 pl-9 pr-3 rounded-full border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>

      <label class="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <input v-model="markAsBilling" type="checkbox" class="rounded border-border" />
        Mark as billing contact
      </label>

      <div class="border border-border rounded-xl overflow-hidden">
        <div v-if="loading" class="px-3 py-6 text-center text-xs text-muted-foreground">
          <Icon name="lucide:loader-2" class="w-4 h-4 animate-spin inline-block" />
        </div>
        <div v-else-if="!filteredContacts.length" class="px-3 py-6 text-center text-xs text-muted-foreground">
          {{ search ? 'No matching unattached contacts.' : 'No unattached contacts available.' }}
        </div>
        <div v-else class="max-h-[320px] overflow-y-auto">
          <button
            v-for="c in filteredContacts"
            :key="c.id"
            class="flex items-center gap-3 w-full h-12 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors text-left disabled:opacity-50"
            :disabled="attaching === c.id"
            @click="attach(c)"
          >
            <div class="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center text-[11px] font-medium text-muted-foreground shrink-0">
              {{ (c.first_name || '?').charAt(0) }}{{ (c.last_name || '').charAt(0) }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{{ c.first_name }} {{ c.last_name }}</p>
              <p v-if="c.email || c.company" class="text-[11px] text-muted-foreground truncate">
                <span v-if="c.email">{{ c.email }}</span>
                <span v-if="c.email && c.company"> · </span>
                <span v-if="c.company">{{ c.company }}</span>
              </p>
            </div>
            <Icon
              v-if="attaching === c.id"
              name="lucide:loader-2"
              class="w-4 h-4 animate-spin text-muted-foreground shrink-0"
            />
            <Icon
              v-else
              name="lucide:link"
              class="w-3.5 h-3.5 text-muted-foreground/40 shrink-0"
            />
          </button>
        </div>
      </div>
    </div>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean;
  clientId: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  attached: [contactId: string];
}>();

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const search = ref('');
const markAsBilling = ref(false);
const loading = ref(false);
const attaching = ref<string | null>(null);
const contacts = ref<any[]>([]);

const { selectedOrg } = useOrganization();
const contactItems = useDirectusItems('contacts');
const toast = useToast();

async function fetchUnattached() {
  loading.value = true;
  try {
    contacts.value = await contactItems.list({
      fields: ['id', 'first_name', 'last_name', 'email', 'company', 'category'],
      filter: {
        _and: [
          { client: { _null: true } },
          { organizations: { organizations_id: { _eq: selectedOrg.value } } },
        ],
      },
      sort: ['first_name', 'last_name'],
      limit: 200,
    });
  } catch (err: any) {
    console.error('[AddExistingContactModal] fetch failed:', err);
    toast.add({ title: 'Failed to load contacts', description: err?.message, color: 'red' });
    contacts.value = [];
  } finally {
    loading.value = false;
  }
}

const filteredContacts = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return contacts.value;
  return contacts.value.filter((c) => {
    const hay = `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''} ${c.company || ''}`.toLowerCase();
    return hay.includes(q);
  });
});

async function attach(contact: any) {
  attaching.value = contact.id;
  try {
    const payload: Record<string, any> = { client: props.clientId };
    if (markAsBilling.value) payload.is_billing_contact = true;
    await contactItems.update(contact.id, payload);
    toast.add({ title: 'Contact attached', color: 'green' });
    emit('attached', contact.id);
    contacts.value = contacts.value.filter((c) => c.id !== contact.id);
  } catch (err: any) {
    console.error('[AddExistingContactModal] attach failed:', err);
    toast.add({ title: 'Failed to attach contact', description: err?.message, color: 'red' });
  } finally {
    attaching.value = null;
  }
}

watch(isOpen, (open) => {
  if (open) {
    search.value = '';
    markAsBilling.value = false;
    fetchUnattached();
  }
});
</script>
