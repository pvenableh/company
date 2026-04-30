<template>
  <form @submit.prevent="handleSubmit" class="space-y-4">
    <div class="grid grid-cols-3 gap-4">
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Prefix</label>
        <select
          v-model="formData.prefix"
          class="w-full rounded-full border bg-background px-3 py-2 text-sm"
        >
          <option value="">—</option>
          <option v-for="p in prefixes" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">First Name *</label>
        <UInput v-model="formData.first_name" required />
      </div>
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Last Name *</label>
        <UInput v-model="formData.last_name" required />
      </div>
    </div>

    <div class="space-y-1">
      <label class="t-label text-muted-foreground">Email *</label>
      <UInput v-model="formData.email" type="email" required />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Phone</label>
        <UInput v-model="formData.phone" />
      </div>
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Title</label>
        <UInput v-model="formData.title" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Company</label>
        <UInput v-model="formData.company" />
      </div>
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Industry</label>
        <select
          v-model="formData.industry"
          class="w-full rounded-full border bg-background px-3 py-2 text-sm"
        >
          <option value="">—</option>
          <option v-for="ind in industries" :key="ind" :value="ind">{{ ind }}</option>
        </select>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Category</label>
        <select
          v-model="formData.category"
          class="w-full rounded-full border bg-background px-3 py-2 text-sm"
        >
          <option value="">—</option>
          <option v-for="c in categories" :key="c" :value="c">{{ categoryLabel(c) }}</option>
        </select>
      </div>
      <div class="space-y-1">
        <label class="t-label text-muted-foreground">Billing Role</label>
        <label
          class="flex items-center gap-2 px-3 py-2"
          :class="hasClient ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'"
        >
          <Switch
            v-model="formData.is_billing_contact"
            :disabled="!hasClient"
          />
          <span class="text-sm">
            Billing contact
            <span v-if="!hasClient" class="text-xs text-muted-foreground">— attach to a client first</span>
          </span>
        </label>
      </div>
    </div>

    <div class="space-y-1">
      <label class="t-label text-muted-foreground">Website</label>
      <UInput v-model="formData.website" placeholder="https://" />
    </div>

    <div class="space-y-1">
      <label class="t-label text-muted-foreground">Mailing Address</label>
      <UTextarea v-model="formData.mailing_address" :rows="2" />
    </div>

    <div class="space-y-1">
      <label class="t-label text-muted-foreground">Tags</label>
      <div class="flex flex-wrap items-center gap-1.5">
        <ContactsContactTagBadge
          v-for="tag in (formData.tags || [])"
          :key="tag"
          :tag="tag"
          removable
          @remove="removeTag(tag)"
        />
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

    <div class="space-y-1">
      <label class="t-label text-muted-foreground">Notes</label>
      <UTextarea v-model="formData.notes" :rows="3" />
    </div>
  </form>
</template>

<script setup lang="ts">
import { Switch } from '~/components/ui/switch';
import type { Contact, CreateContactPayload } from '~~/shared/email/contacts';

const props = defineProps<{
  contact?: Contact | null;
  saving?: boolean;
}>();

const emit = defineEmits<{
  submit: [data: CreateContactPayload];
}>();

const prefixes = ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.', 'Mx.'];
const industries = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Real Estate',
  'Retail', 'Hospitality', 'Legal', 'Non-Profit', 'Government', 'Other',
];
const categories = ['client', 'prospect', 'architect', 'developer', 'hospitality', 'partner', 'media'] as const;
function categoryLabel(c: string) {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

const hasClient = computed(() => {
  const c: any = props.contact?.client;
  if (!c) return false;
  return typeof c === 'string' ? !!c : !!c?.id;
});

const formData = reactive<any>({
  prefix: props.contact?.prefix || '',
  first_name: props.contact?.first_name || '',
  last_name: props.contact?.last_name || '',
  email: props.contact?.email || '',
  phone: props.contact?.phone || '',
  title: props.contact?.title || '',
  company: props.contact?.company || '',
  industry: props.contact?.industry || '',
  website: props.contact?.website || '',
  mailing_address: props.contact?.mailing_address || '',
  tags: [...(props.contact?.tags || [])],
  notes: props.contact?.notes || '',
  category: props.contact?.category || '',
  is_billing_contact: !!props.contact?.is_billing_contact,
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
  // Flush any pending tag input
  if (newTag.value.trim()) addTag();
  emit('submit', { ...formData });
}

defineExpose({
  triggerSubmit: handleSubmit,
  hasRequired: computed(() => !!(formData.first_name?.trim() && formData.last_name?.trim() && formData.email?.trim())),
});
</script>
