<template>
  <FormModal
    v-model="isOpen"
    :title="isEditing ? 'Edit Connection' : 'New Connection'"
    :is-editing="isEditing"
    :saving="saving"
    :submit-disabled="!formValid"
    :can-delete="isEditing"
    @submit="handleSave"
    @delete="handleDelete"
  >
    <div class="space-y-4">
      <!-- Client -->
      <div class="space-y-1.5">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Client</label>
        <select
          v-model="form.client"
          :disabled="saving || !!props.lockClientId"
          class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
        >
          <option value="">Select a client...</option>
          <option v-for="c in availableClients" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
      </div>

      <!-- Role -->
      <div class="space-y-1.5">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Role</label>
        <select
          v-model="form.role"
          :disabled="saving"
          class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
        >
          <option v-for="r in CONNECTION_ROLE_OPTIONS" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>
      </div>

      <!-- Introduced By -->
      <div class="space-y-1.5">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Introduction</label>
        <select
          v-model="form.introduced_by"
          :disabled="saving"
          class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
        >
          <option :value="null">&mdash;</option>
          <option v-for="i in INTRODUCED_BY_OPTIONS" :key="i.value" :value="i.value">{{ i.label }}</option>
        </select>
      </div>

      <!-- Notes -->
      <div class="space-y-1.5">
        <label class="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</label>
        <textarea
          v-model="form.notes"
          rows="3"
          placeholder="Optional context about this relationship..."
          :disabled="saving"
          class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
      </div>
    </div>
  </FormModal>
</template>

<script setup lang="ts">
import type { ContactConnection, Client } from '~~/shared/directus';
import {
  CONNECTION_ROLE_OPTIONS,
  INTRODUCED_BY_OPTIONS,
  type ContactConnectionRole,
  type ContactConnectionIntroducedBy,
} from '~/composables/useContactConnections';

const props = defineProps<{
  contactId: string;
  /** Existing connection for editing; omit for create mode */
  connection?: ContactConnection | null;
  /** When set, the client dropdown is locked to this ID (creating from /clients/[id]) */
  lockClientId?: string | null;
}>();

const emit = defineEmits<{
  saved: [];
  deleted: [];
}>();

const isOpen = defineModel<boolean>({ default: false });
const isEditing = computed(() => !!props.connection?.id);
const saving = ref(false);
const toast = useToast();

const { createConnection, updateConnection, deleteConnection } = useContactConnections();
const { getClients } = useClients();

const availableClients = ref<Array<{ id: string; name: string }>>([]);

const form = ref<{
  client: string;
  role: ContactConnectionRole;
  introduced_by: ContactConnectionIntroducedBy | null;
  notes: string;
}>({
  client: '',
  role: 'referral_partner',
  introduced_by: null,
  notes: '',
});

const formValid = computed(() => !!form.value.client && !!form.value.role);

function resetForm() {
  const c = props.connection;
  form.value = {
    client: props.lockClientId || (typeof c?.client === 'string' ? c.client : (c?.client as any)?.id) || '',
    role: c?.role || 'referral_partner',
    introduced_by: c?.introduced_by ?? null,
    notes: c?.notes || '',
  };
}

async function loadClients() {
  try {
    const result = await getClients({ limit: 200 });
    availableClients.value = (result.data as any[]).map((c) => ({ id: c.id, name: c.name }));
  } catch {
    availableClients.value = [];
  }
}

watch(isOpen, async (open) => {
  if (!open) return;
  resetForm();
  if (!availableClients.value.length) await loadClients();
});

async function handleSave() {
  if (!formValid.value) return;
  saving.value = true;
  try {
    const payload = {
      contact: props.contactId,
      client: form.value.client,
      role: form.value.role,
      introduced_by: form.value.introduced_by,
      notes: form.value.notes.trim() || null,
    };
    if (isEditing.value && props.connection?.id) {
      await updateConnection(props.connection.id as any, payload);
      toast.add({ title: 'Connection updated', color: 'green' });
    } else {
      await createConnection(payload);
      toast.add({ title: 'Connection added', color: 'green' });
    }
    emit('saved');
    isOpen.value = false;
  } catch (err: any) {
    console.error('Connection save failed:', err);
    toast.add({ title: 'Failed to save connection', description: err.message, color: 'red' });
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  if (!isEditing.value || !props.connection?.id) return;
  if (!confirm('Remove this connection?')) return;
  saving.value = true;
  try {
    await deleteConnection(props.connection.id as any);
    toast.add({ title: 'Connection removed', color: 'green' });
    emit('deleted');
    isOpen.value = false;
  } catch (err: any) {
    console.error('Connection delete failed:', err);
    toast.add({ title: 'Failed to remove connection', color: 'red' });
  } finally {
    saving.value = false;
  }
}
</script>
