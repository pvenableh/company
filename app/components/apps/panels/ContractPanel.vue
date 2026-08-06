<!--
  ContractPanel — slide-over body for a single contract.

  Wraps the shared `<AppsDocumentsDocumentWorkspace type="contract">` in `compact` mode
  inside `AppSlideOverShell` so the panel renders the same workspace as
  `/contracts/[id]` without a full-route navigation. Reads the panel
  registry's `id` prop as the contractId.
-->
<script setup lang="ts">
import type { FlipFromPayload } from '~/composables/useFlipFromRow';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string; flipFrom?: FlipFromPayload | null }>();
defineEmits<{ (e: 'close'): void }>();

// Create mode — host <ContractsFormModal embedded>. The form does its own
// post-create edit-hop (pushes contract:id/edit, replacing this create panel),
// so we notify surfaces WITHOUT popping.
const isCreate = computed(() => props.mode === 'create');
const { createContext, emitCreated } = useCreatePanel<any, any>('contract');
function onContractCreated(c: any) {
  emitCreated(c, { pop: false });
}

const contract = ref<any | null>(null);
const { setEntity, entityId, resetEntityContext } = useEntityPageContext();

function onLoaded(c: any) {
  contract.value = c;
  // Register contract context so Earnest is aware of what you're viewing.
  setEntity('contract', String(c.id), c.title || 'Contract');
}

const title = computed(() => (isCreate.value ? 'New Contract' : contract.value?.title || 'Contract'));
const subtitle = computed(() => {
  const o = contract.value?.organization?.name;
  const c = contract.value?.contact;
  const contactName = c
    ? [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || null
    : null;
  return contactName ? `${o ? o + ' · ' : ''}${contactName}` : (o || null);
});

const fullPageHref = computed(() => {
  const id = contract.value?.id || props.id;
  return props.mode === 'edit' ? `/contracts/${id}?edit=1` : `/contracts/${id}`;
});

const statusLabel = computed(() => (contract.value as any)?.contract_status || null);
const clientName = computed(() => (contract.value as any)?.client?.name || null);

// Contract → Project: create the project (+ seed events from the scope phases),
// back-link the contract, and open the new project in-shell.
const workProjectSlide = useAppSlideOver('work-project');
const converting = ref(false);
const alreadyLinked = computed(() => !!(contract.value as any)?.project);
async function createProjectFromContract() {
  const cid = contract.value?.id;
  if (!cid || converting.value) return;
  converting.value = true;
  try {
    const res = await $fetch<{ projectId: string }>(`/api/projects/from-contract/${cid}`, { method: 'POST' });
    if (contract.value) (contract.value as any).project = res.projectId;
    if (res.projectId) workProjectSlide.open(String(res.projectId));
  } catch (err: any) {
    console.error('[contract→project] failed:', err?.data?.message || err?.message);
  } finally {
    converting.value = false;
  }
}

onBeforeUnmount(() => {
  if (entityId.value === String(props.id)) resetEntityContext();
});
</script>

<template>
  <AppSlideOverShell
    :title="title"
    :subtitle="subtitle"
    :flip-from="flipFrom"
    @close="$emit('close')"
  >
    <template v-if="!isCreate" #actions>
      <button
        v-if="!alreadyLinked"
        :disabled="converting"
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
        title="Create a project from this contract (seeds milestones from the scope)"
        @click="createProjectFromContract"
      >
        <Icon :name="converting ? 'lucide:loader-2' : 'lucide:folder-plus'" :class="['w-3 h-3', converting && 'animate-spin']" />
        {{ converting ? 'Creating…' : 'Create project' }}
      </button>
      <NuxtLink
        :to="fullPageHref"
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        :title="`Open full page for ${title}`"
      >
        <Icon name="lucide:external-link" class="w-3 h-3" />
        Full Page
      </NuxtLink>
    </template>

    <template v-if="!isCreate" #hero>
      <div class="flex items-center justify-between gap-3 px-1 py-1.5">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-foreground truncate">
            {{ contract?.title || 'Contract' }}
          </p>
          <p v-if="clientName" class="text-[11px] text-muted-foreground truncate mt-0.5">
            {{ clientName }}
          </p>
        </div>
        <span
          v-if="statusLabel"
          class="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider shrink-0"
        >
          {{ statusLabel }}
        </span>
      </div>
    </template>

    <ContractsFormModal
      v-if="isCreate"
      embedded
      :lead-id="createContext?.leadId ?? null"
      :proposal-id="createContext?.proposalId ?? null"
      @created="onContractCreated"
    />

    <AppsDocumentsDocumentWorkspace
      v-else
      type="contract"
      :document-id="id"
      compact
      @loaded="onLoaded"
      @back="$emit('close')"
    />
  </AppSlideOverShell>
</template>
