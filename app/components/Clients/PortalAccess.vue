<template>
  <div class="ios-card p-5">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Portal Access</h3>
        <p class="text-xs text-muted-foreground/70 mt-0.5">Client users with login access scoped to {{ clientName || 'this client' }}.</p>
      </div>
      <button
        v-if="canManage"
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors"
        @click="showInvite = true"
      >
        <Icon name="lucide:user-plus" class="w-3 h-3" />
        Invite User
      </button>
    </div>

    <div v-if="loading" class="text-xs text-muted-foreground text-center py-4">Loading…</div>

    <div v-else-if="!memberships.length" class="text-sm text-muted-foreground/70 text-center py-6">
      No portal users invited yet.
    </div>

    <div v-else class="space-y-px">
      <div
        v-for="m in memberships"
        :key="m.id"
        class="flex items-center gap-3 py-2.5 px-1 border-b border-border/30 last:border-b-0"
      >
        <div class="size-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-[10px] font-semibold text-muted-foreground">
          {{ initials(m.user) }}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">{{ displayName(m.user) || m.user?.email || 'Unknown user' }}</p>
          <p class="text-[11px] text-muted-foreground/70 truncate">{{ m.user?.email }}</p>
        </div>
        <div class="hidden sm:flex flex-col items-end text-[10px] text-muted-foreground/70 shrink-0">
          <span v-if="m.user?.last_access" :title="new Date(m.user.last_access).toLocaleString()">
            Last login {{ relativeDate(m.user.last_access) }}
          </span>
          <span v-else-if="m.invited_at">
            Invited {{ relativeDate(m.invited_at) }}
          </span>
        </div>
        <span
          class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize shrink-0"
          :class="statusClasses(m.status)"
        >
          {{ m.status }}
        </span>
        <div v-if="canManage" class="flex items-center gap-1 shrink-0">
          <button
            v-if="m.status === 'pending'"
            class="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-border text-[10px] font-medium hover:bg-muted transition-colors"
            :disabled="actingId === m.id"
            @click="onResend(m)"
          >
            <Icon
              :name="actingId === m.id ? 'lucide:loader-2' : 'lucide:send'"
              :class="['w-3 h-3', actingId === m.id && 'animate-spin']"
            />
            Resend
          </button>
          <button
            v-if="m.status === 'suspended'"
            class="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-border text-[10px] font-medium hover:bg-muted transition-colors"
            :disabled="actingId === m.id"
            @click="onRestore(m)"
          >
            <Icon name="lucide:refresh-cw" class="w-3 h-3" />
            Restore
          </button>
          <button
            v-else
            class="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-border text-[10px] font-medium text-destructive/80 hover:bg-destructive/10 hover:border-destructive/30 transition-colors"
            :disabled="actingId === m.id"
            @click="onRevoke(m)"
          >
            <Icon name="lucide:user-minus" class="w-3 h-3" />
            Revoke
          </button>
        </div>
      </div>
    </div>

    <ClientsInviteClientModal
      v-if="organizationId"
      v-model="showInvite"
      :organization-id="organizationId"
      :client-id="clientId"
      :client-name="clientName"
      @invited="onInvited"
    />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  clientId: string;
  clientName?: string;
  canManage?: boolean;
}>();

const toast = useToast();
const { selectedOrg } = useOrganization();

const organizationId = computed(() => selectedOrg.value);
const membershipItems = useDirectusItems('org_memberships');

const memberships = ref<any[]>([]);
const loading = ref(false);
const actingId = ref<string | null>(null);
const showInvite = ref(false);

async function load() {
  if (!props.clientId) return;
  loading.value = true;
  try {
    memberships.value = await membershipItems.list({
      filter: { client: { _eq: props.clientId } },
      fields: [
        'id', 'status', 'invited_at',
        'user.id', 'user.first_name', 'user.last_name', 'user.email', 'user.last_access',
        'role.slug',
      ],
      sort: ['-invited_at'],
      limit: -1,
    });
  } catch (e: any) {
    console.error('Failed to load portal memberships:', e);
    memberships.value = [];
  } finally {
    loading.value = false;
  }
}

function initials(user: any): string {
  if (!user) return '?';
  const f = (user.first_name || '').charAt(0);
  const l = (user.last_name || '').charAt(0);
  return (f + l).toUpperCase() || (user.email?.charAt(0)?.toUpperCase() ?? '?');
}

function displayName(user: any): string {
  if (!user) return '';
  const f = user.first_name || '';
  const l = user.last_name || '';
  return `${f} ${l}`.trim();
}

function statusClasses(status: string): string {
  if (status === 'active') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  if (status === 'pending') return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  return 'bg-muted text-muted-foreground';
}

function relativeDate(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return date.toLocaleDateString();
}

async function onResend(m: any) {
  if (!organizationId.value) return;
  actingId.value = m.id;
  try {
    const result = await $fetch('/api/org/resend-client-invite', {
      method: 'POST',
      body: { membershipId: m.id, organizationId: organizationId.value },
    });
    toast.add({ title: 'Invitation Resent', description: result.message, color: 'green' });
  } catch (e: any) {
    const message = e?.data?.message || e?.message || 'Failed to resend invitation';
    toast.add({ title: 'Error', description: message, color: 'red' });
  } finally {
    actingId.value = null;
  }
}

async function onRevoke(m: any) {
  if (!confirm('Revoke portal access for this user? They will no longer be able to sign in.')) return;
  actingId.value = m.id;
  try {
    await membershipItems.update(m.id, { status: 'suspended' });
    toast.add({ title: 'Access Revoked', description: 'Portal access has been suspended.', color: 'green' });
    await load();
  } catch (e: any) {
    const message = e?.data?.message || e?.message || 'Failed to revoke access';
    toast.add({ title: 'Error', description: message, color: 'red' });
  } finally {
    actingId.value = null;
  }
}

async function onRestore(m: any) {
  actingId.value = m.id;
  try {
    await membershipItems.update(m.id, { status: 'active' });
    toast.add({ title: 'Access Restored', description: 'Portal access has been re-enabled.', color: 'green' });
    await load();
  } catch (e: any) {
    const message = e?.data?.message || e?.message || 'Failed to restore access';
    toast.add({ title: 'Error', description: message, color: 'red' });
  } finally {
    actingId.value = null;
  }
}

async function onInvited() {
  showInvite.value = false;
  await load();
}

watch(() => props.clientId, () => load(), { immediate: true });

defineExpose({ reload: load });
</script>
