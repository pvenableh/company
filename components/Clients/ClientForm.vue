<template>
  <form @submit.prevent="handleSubmit" class="space-y-4">
    <div>
      <label class="block text-sm font-medium mb-1">Name *</label>
      <input
        v-model="formData.name"
        required
        class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="Client name"
      />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Slug</label>
        <input
          v-model="formData.slug"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="client-slug"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Status</label>
        <select v-model="formData.status" class="w-full rounded-md border bg-background px-3 py-2 text-sm">
          <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Website</label>
        <input
          v-model="formData.website"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="https://"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Industry</label>
        <select
          v-model="formData.industry"
          class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="">Select industry...</option>
          <option v-for="ind in industries" :key="ind.id" :value="ind.id">{{ ind.name }}</option>
        </select>
      </div>
    </div>

    <div>
      <label class="block text-sm font-medium mb-1">Tags</label>
      <div class="flex flex-wrap gap-1 mb-2">
        <span
          v-for="tag in formData.tags"
          :key="tag"
          class="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-0.5 text-xs text-muted-foreground"
        >
          {{ tag }}
          <button type="button" class="hover:text-foreground transition-colors" @click="removeTag(tag)">
            <Icon name="lucide:x" class="w-3 h-3" />
          </button>
        </span>
      </div>
      <div class="flex gap-2">
        <input
          v-model="newTag"
          class="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="Add tag..."
          @keydown.enter.prevent="addTag"
        />
        <Button type="button" variant="outline" size="sm" @click="addTag">Add</Button>
      </div>
    </div>

    <!-- Billing Contacts -->
    <div>
      <label class="block text-sm font-medium mb-1">Billing Contacts</label>
      <p class="text-xs text-muted-foreground mb-2">Invoice recipients — these emails receive payment links and invoice notifications.</p>
      <div class="space-y-2 mb-2">
        <div
          v-for="(contact, i) in formData.billing_contacts"
          :key="i"
          class="flex gap-2 items-center"
        >
          <input
            v-model="contact.name"
            class="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Name"
          />
          <input
            v-model="contact.email"
            type="email"
            class="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="email@example.com"
          />
          <button
            type="button"
            class="p-1.5 text-muted-foreground/40 hover:text-destructive transition-colors"
            @click="formData.billing_contacts.splice(i, 1)"
          >
            <Icon name="lucide:trash-2" class="w-4 h-4" />
          </button>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        @click="formData.billing_contacts.push({ name: '', email: '' })"
      >
        <Icon name="lucide:plus" class="w-3 h-3 mr-1" />
        Add Contact
      </Button>
    </div>

    <div>
      <label class="block text-sm font-medium mb-1">Notes</label>
      <textarea
        v-model="formData.notes"
        rows="3"
        class="w-full rounded-md border bg-background px-3 py-2 text-sm"
        placeholder="Internal notes about this client..."
      />
    </div>

    <!-- Brand & Strategy -->
    <div v-if="client?.id" class="border-t pt-4 mt-2">
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
          :entity-id="client.id"
          :organization-id="typeof client.organization === 'string' ? client.organization : client.organization?.id || ''"
        />

        <BrandAIFieldSuggest
          v-model="formData.goals"
          label="Goals"
          field="goals"
          placeholder="Business goals and objectives..."
          entity-type="client"
          :entity-id="client.id"
          :organization-id="typeof client.organization === 'string' ? client.organization : client.organization?.id || ''"
        />

        <BrandAIFieldSuggest
          v-model="formData.target_audience"
          label="Target Audience"
          field="target_audience"
          placeholder="Ideal customer profile, demographics, psychographics..."
          entity-type="client"
          :entity-id="client.id"
          :organization-id="typeof client.organization === 'string' ? client.organization : client.organization?.id || ''"
        />

        <div>
          <label class="block text-sm font-medium mb-1">Location</label>
          <input
            v-model="formData.location"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="City, region, or Remote/Global"
          />
        </div>
      </div>
    </div>

    <div class="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" @click="$emit('cancel')">Cancel</Button>
      <Button type="submit" :disabled="saving">
        {{ saving ? 'Saving...' : (client ? 'Update' : 'Create') }}
      </Button>
    </div>
  </form>
</template>

<script setup lang="ts">
import type { Client } from '~/types/directus';
import { Button } from '~/components/ui/button';

const props = defineProps<{
  client?: Client | null;
  saving?: boolean;
}>();

const emit = defineEmits<{
  save: [data: Partial<Client>];
  cancel: [];
}>();

const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Prospect', value: 'prospect' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Archived', value: 'archived' },
];

const industryItems = useDirectusItems('industries');
const industries = ref<Array<{ id: string; name: string }>>([]);

onMounted(async () => {
  try {
    industries.value = await industryItems.list({
      fields: ['id', 'name'],
      filter: { status: { _eq: 'published' } },
      sort: ['name'],
      limit: -1,
    }) as any;
  } catch { /* industries may not be accessible */ }
});

const formData = reactive({
  name: props.client?.name || '',
  slug: props.client?.slug || '',
  status: props.client?.status || 'active',
  website: props.client?.website || '',
  industry: (typeof props.client?.industry === 'object' ? (props.client?.industry as any)?.id : props.client?.industry) || '',
  notes: props.client?.notes || '',
  tags: [...(props.client?.tags || [])] as string[],
  billing_contacts: [...(props.client?.billing_contacts || [])] as { name: string; email: string }[],
  brand_direction: props.client?.brand_direction || '',
  goals: props.client?.goals || '',
  target_audience: props.client?.target_audience || '',
  location: props.client?.location || '',
});

const newTag = ref('');

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
  const validContacts = formData.billing_contacts.filter(c => c.email?.trim());
  const primaryContact = validContacts[0];

  emit('save', {
    name: formData.name,
    slug: formData.slug || undefined,
    status: formData.status as Client['status'],
    website: formData.website || undefined,
    industry: formData.industry || undefined,
    notes: formData.notes || undefined,
    tags: formData.tags.length ? formData.tags : undefined,
    billing_contacts: validContacts.length ? validContacts : undefined,
    // Keep billing_email/billing_name in sync with primary billing contact
    billing_email: primaryContact?.email?.trim() || undefined,
    billing_name: primaryContact?.name?.trim() || undefined,
    brand_direction: formData.brand_direction || undefined,
    goals: formData.goals || undefined,
    target_audience: formData.target_audience || undefined,
    location: formData.location || undefined,
  });
}
</script>
