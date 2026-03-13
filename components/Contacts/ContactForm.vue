<template>
  <form @submit.prevent="$emit('submit', formData)" class="space-y-4">
    <div class="grid grid-cols-3 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Prefix</label>
        <select v-model="formData.prefix" class="w-full rounded-md border bg-background px-3 py-2 text-sm">
          <option value="">—</option>
          <option v-for="p in prefixes" :key="p" :value="p">{{ p }}</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">First Name *</label>
        <input v-model="formData.first_name" required class="w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Last Name *</label>
        <input v-model="formData.last_name" required class="w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </div>
    </div>

    <div>
      <label class="block text-sm font-medium mb-1">Email *</label>
      <input v-model="formData.email" type="email" required class="w-full rounded-md border bg-background px-3 py-2 text-sm" />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Phone</label>
        <input v-model="formData.phone" class="w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Title</label>
        <input v-model="formData.title" class="w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">Company</label>
        <input v-model="formData.company" class="w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Industry</label>
        <select v-model="formData.industry" class="w-full rounded-md border bg-background px-3 py-2 text-sm">
          <option value="">—</option>
          <option v-for="ind in industries" :key="ind" :value="ind">{{ ind }}</option>
        </select>
      </div>
    </div>

    <div>
      <label class="block text-sm font-medium mb-1">Website</label>
      <input v-model="formData.website" class="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="https://" />
    </div>

    <div>
      <label class="block text-sm font-medium mb-1">Mailing Address</label>
      <textarea v-model="formData.mailing_address" rows="2" class="w-full rounded-md border bg-background px-3 py-2 text-sm" />
    </div>

    <div>
      <label class="block text-sm font-medium mb-1">Tags</label>
      <div class="flex flex-wrap gap-1 mb-2">
        <ContactsContactTagBadge
          v-for="tag in (formData.tags || [])"
          :key="tag"
          :tag="tag"
          removable
          @remove="removeTag(tag)"
        />
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

    <div>
      <label class="block text-sm font-medium mb-1">Notes</label>
      <textarea v-model="formData.notes" rows="3" class="w-full rounded-md border bg-background px-3 py-2 text-sm" />
    </div>

    <div class="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" @click="$emit('cancel')">Cancel</Button>
      <Button type="submit" :disabled="saving">
        {{ saving ? 'Saving...' : (contact ? 'Update' : 'Create') }}
      </Button>
    </div>
  </form>
</template>

<script setup lang="ts">
import type { Contact, CreateContactPayload } from '~/types/email/contacts';
import { Button } from '~/components/ui/button';

const props = defineProps<{
  contact?: Contact | null;
  saving?: boolean;
}>();

defineEmits<{
  submit: [data: CreateContactPayload];
  cancel: [];
}>();

const prefixes = ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.', 'Mx.'];
const industries = [
  'Technology', 'Healthcare', 'Finance', 'Education', 'Real Estate',
  'Retail', 'Hospitality', 'Legal', 'Non-Profit', 'Government', 'Other',
];

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
</script>
