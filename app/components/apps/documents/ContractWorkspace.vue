<!--
  ContractWorkspace — shared body for the contract detail surface.

  Consumed by both the `/contracts/[id]` full-page route AND the
  `contract` slide-over panel (`<ContractPanel>`). Pass `:contractId`;
  the component fetches itself. Emits `@loaded` with the contract
  record (panel uses it to populate the slide-over shell title).

  `:compact` hides chrome the slide-over shell already provides (back
  link + inline h1/subtitle + Ask Earnest button + AI sidebar overlay,
  which would render inside the slide-over's transformed container
  instead of at viewport level — see [AppSlideOverShell.vue]).
-->
<script setup lang="ts">
import { CONTRACT_STATUS_LABELS } from '~~/shared/contracts';
import { shouldHideEarnestFooter } from '~~/shared/branding';

const props = defineProps<{
  contractId: string;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'loaded', contract: any): void;
  (e: 'back'): void;
}>();

const router = useRouter();
const config = useRuntimeConfig();
const { getContract } = useContracts();
const { getStatusBadgeClasses } = useStatusStyle();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();
const { openEarnestPanel } = useEarnestPanel();
const slideOverStack = useAppSlideOverStack();

const contract = ref<any>(null);
const loading = ref(true);
const showEditModal = ref(false);
const contractItems = useDirectusItems('contracts');
const toast = useToast();

const blocks = ref<any[]>([]);
const blocksDirty = ref(false);
const savingBlocks = ref(false);

type Mode = 'view' | 'edit' | 'activity';
const route = useRoute();
const mode = ref<Mode>(route.query.edit ? 'edit' : 'view');

async function fetchData() {
  loading.value = true;
  try {
    contract.value = await getContract(props.contractId);
    blocks.value = Array.isArray(contract.value?.blocks) ? contract.value.blocks : [];
    blocksDirty.value = false;
    if (!props.compact) {
      useHead({ title: `${contract.value?.title || 'Contract'} | Earnest` });
    }
    if (contract.value) emit('loaded', contract.value);
  } catch (e) {
    console.error('Failed to load contract:', e);
  } finally {
    loading.value = false;
  }
}

function onBlocksChange(next: any[]) {
  blocks.value = next;
  blocksDirty.value = true;
}

async function saveBlocks() {
  if (!contract.value?.id || savingBlocks.value) return;
  savingBlocks.value = true;
  try {
    await contractItems.update(contract.value.id, { blocks: blocks.value });
    contract.value = { ...contract.value, blocks: [...blocks.value] };
    blocksDirty.value = false;
    toast.add({ title: 'Saved', color: 'green' });
  } catch (err: any) {
    toast.add({ title: 'Failed to save blocks', description: err.message, color: 'red' });
  } finally {
    savingBlocks.value = false;
  }
}

function onContractUpdated(updated: any) {
  contract.value = { ...contract.value, ...updated };
  emit('loaded', contract.value);
}

function onContractDeleted() {
  if (props.compact) {
    emit('back');
  } else {
    router.push('/apps/money?floor=documents&tab=contracts');
  }
}

const sendingForSignature = ref(false);
async function sendForSignature() {
  if (!contract.value?.id || sendingForSignature.value) return;
  sendingForSignature.value = true;
  try {
    // Server-side transition + gated email. For allow-listed orgs it emails the
    // contact directly; otherwise it returns transmitted:false and we fall back
    // to copying the signing link (the historical behaviour).
    const res = await $fetch<{
      status: string; signing_token: string; url: string; transmitted: boolean; recipient?: string; reason?: string;
    }>(`/api/contracts/${contract.value.id}/send`, { method: 'POST' });

    contract.value = {
      ...contract.value,
      contract_status: res.status,
      signing_token: res.signing_token,
      date_sent: contract.value.date_sent || new Date().toISOString().split('T')[0],
    };
    emit('loaded', contract.value);

    if (res.transmitted) {
      toast.add({
        title: 'Sent for signature',
        description: res.recipient ? `Emailed to ${res.recipient}` : 'Signing email sent',
        color: 'green',
      });
    } else {
      await navigator.clipboard.writeText(res.url).catch(() => {});
      toast.add({
        title: 'Marked as sent',
        description: 'Signing link copied to clipboard',
        color: 'green',
      });
    }
  } catch (err: any) {
    toast.add({ title: 'Failed', description: err.data?.message || err.message, color: 'red' });
  } finally {
    sendingForSignature.value = false;
  }
}

// Deterministic contract→invoice rail. Queues a create_invoice AI action
// pre-filled from this signed contract (client + total value) — nothing is
// billed until the user approves the proposal in the AI Activity queue, so the
// audit trail + undo are preserved.
const billingContract = ref(false);
const billedActionId = ref<string | null>(null);
async function handleBillContract() {
  if (!contract.value?.id || billingContract.value) return;
  billingContract.value = true;
  try {
    const res = await $fetch<{ actionId: string | null; status: string; summary: string }>(
      `/api/contracts/${contract.value.id}/bill`,
      { method: 'POST' },
    );
    billedActionId.value = res.actionId;
    toast.add({
      title: 'Invoice drafted',
      description: 'Waiting for your approval in AI Activity — nothing is billed yet.',
      color: 'green',
    });
  } catch (err: any) {
    toast.add({ title: 'Could not draft invoice', description: err.data?.message || err.message, color: 'red' });
  } finally {
    billingContract.value = false;
  }
}

const seller = computed(() => {
  const o: any = contract.value?.organization;
  if (!o) return null;
  return {
    name: o.name, logo: o.logo, address: o.address,
    phone: o.phone, email: o.email, website: o.website,
  };
});

const recipient = computed(() => {
  const c: any = contract.value?.contact;
  if (!c) return null;
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return {
    name: c.company || name || null,
    address: null as string | null,
    emails: c.email ? [c.email] : null,
  };
});

const docMeta = computed(() => ({
  kind: 'CONTRACT',
  code: contract.value?.id ? `C-${String(contract.value.id).slice(0, 8)}` : null,
  date: contract.value?.date_sent || contract.value?.date_created,
  dateLabel: 'Sent',
  expiresAt: contract.value?.effective_date || contract.value?.valid_until,
  expiresLabel: contract.value?.effective_date ? 'Effective' : 'Valid until',
  status: contract.value?.contract_status,
}));

const hasBlocks = computed(() => Array.isArray(contract.value?.blocks) && contract.value.blocks.length > 0);

const coverContext = computed(() => {
  const o: any = contract.value?.organization;
  const logo = o?.logo;
  const logoId = typeof logo === 'string' ? logo : logo?.id;
  return {
    logoUrl: logoId ? `${config.public.directusUrl}/assets/${logoId}?key=medium-contain` : null,
    title: contract.value?.title || null,
    recipient: recipient.value?.name || null,
    dateSent: contract.value?.date_sent || contract.value?.date_created || null,
    dateLabel: 'Sent',
    expiresAt: contract.value?.effective_date || contract.value?.valid_until || null,
    expiresLabel: contract.value?.effective_date ? 'Effective' : 'Valid until',
  };
});

const hideFooter = computed(() => shouldHideEarnestFooter({
  whitelabel: contract.value?.organization?.whitelabel,
  plan: contract.value?.organization?.plan,
}));

function formatTotal(n: number | null | undefined) {
  if (n == null) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

function copySigningLink() {
  if (!contract.value?.signing_token) return;
  navigator.clipboard.writeText(window.location.origin + '/contracts/sign/' + contract.value.signing_token);
  toast.add({ title: 'Copied', color: 'green' });
}

// ── Inline-editable Details ───────────────────────────────────────
const detailValues = computed(() => ({
  title: contract.value?.title ?? '',
  contract_status: contract.value?.contract_status ?? '',
  total_value: contract.value?.total_value ?? '',
  effective_date: contract.value?.effective_date ? String(contract.value.effective_date).slice(0, 10) : '',
  valid_until: contract.value?.valid_until ? String(contract.value.valid_until).slice(0, 10) : '',
  date_sent: contract.value?.date_sent ? String(contract.value.date_sent).slice(0, 10) : '',
}));

const detailFields = [
  { key: 'title', label: 'Title', type: 'text' as const, placeholder: 'Contract title' },
  {
    key: 'contract_status', label: 'Status', type: 'select' as const,
    options: [
      { value: 'draft', label: 'Draft' },
      { value: 'sent', label: 'Sent' },
      { value: 'signed', label: 'Signed' },
      { value: 'declined', label: 'Declined' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: 'expired', label: 'Expired' },
    ],
  },
  { key: 'total_value', label: 'Value', type: 'number' as const, prefix: '$' },
  { key: 'effective_date', label: 'Effective', type: 'date' as const },
  { key: 'valid_until', label: 'Valid until', type: 'date' as const },
  { key: 'date_sent', label: 'Sent', type: 'date' as const },
];

function onDetailsUpdated(patch: Record<string, any>) {
  if (!contract.value) return;
  Object.assign(contract.value, patch);
  emit('loaded', contract.value);
}

// ── External file attachment ──────────────────────────────────────
// Contracts drafted/signed outside Earnest can be attached here — we upload
// the file to Directus and set the contract's `file` relation.
const { upload: uploadDirectusFile } = useDirectusFiles();
const attachInput = ref<HTMLInputElement | null>(null);
const attaching = ref(false);
const attachmentUrl = computed(() =>
  contract.value?.file?.id ? `${config.public.directusUrl}/assets/${contract.value.file.id}?download` : null,
);

function pickAttachment() {
  attachInput.value?.click();
}

async function onAttachmentSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !contract.value?.id) return;
  attaching.value = true;
  try {
    const res: any = await uploadDirectusFile(file, { title: file.name });
    const rec = res?.data || res;
    const fileId = rec?.id;
    if (!fileId) throw new Error('Upload returned no file id');
    await contractItems.update(contract.value.id, { file: fileId });
    contract.value = {
      ...contract.value,
      file: { id: fileId, title: rec.title || file.name, type: rec.type || file.type, filesize: rec.filesize },
    };
    toast.add({ title: 'File attached', color: 'green' });
  } catch (err: any) {
    toast.add({ title: 'Could not attach file', description: err?.data?.message || err?.message, color: 'red' });
  } finally {
    attaching.value = false;
    if (input) input.value = '';
  }
}

async function removeAttachment() {
  if (!contract.value?.id) return;
  try {
    await contractItems.update(contract.value.id, { file: null });
    contract.value = { ...contract.value, file: null };
  } catch (err: any) {
    toast.add({ title: 'Could not remove attachment', description: err?.data?.message || err?.message, color: 'red' });
  }
}

// Mark-read only when this workspace owns the full page chrome — inside the
// slide-over the panel owns the read-tracking decision (currently it doesn't
// mark, matching the InvoiceWorkspace convention).
if (!props.compact) {
  useMarkItemRead('contracts', toRef(() => props.contractId));
}

onMounted(fetchData);
watch(() => props.contractId, () => {
  contract.value = null;
  fetchData();
});

if (!props.compact) {
  watch(contract, (c) => {
    if (c) setEntity('contract', String(c.id), c.title || 'Contract');
  }, { immediate: true });
  onUnmounted(() => clearEntity());
}
</script>

<template>
  <div>
    <div v-if="loading" class="flex items-center justify-center py-20">
      <EIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-muted-foreground/40" />
    </div>

    <template v-else-if="contract">
      <NuxtLink
        v-if="!compact"
        to="/apps/money?floor=documents&tab=contracts"
        class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mt-4 mb-2"
      >
        <EIcon name="lucide:chevron-left" class="w-3 h-3" />
        Contracts
      </NuxtLink>

      <!-- Header — in compact mode the shell already shows title+subtitle,
           so collapse to just the status pill + action row. -->
      <div class="flex items-center justify-between mb-5 gap-3 flex-wrap" :class="{ 'mt-2': compact }">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 v-if="!compact" class="text-base font-semibold truncate">{{ contract.title || 'Untitled Contract' }}</h1>
            <span
              v-if="contract.contract_status"
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
              :class="getStatusBadgeClasses(contract.contract_status)"
            >
              {{ CONTRACT_STATUS_LABELS[contract.contract_status as keyof typeof CONTRACT_STATUS_LABELS] || contract.contract_status }}
            </span>
          </div>
          <p v-if="!compact" class="text-xs text-muted-foreground">
            {{ contract.organization?.name }}
            <span v-if="contract.contact"> · {{ contract.contact.first_name }} {{ contract.contact.last_name }}</span>
          </p>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
          <UiActionButton icon="earnest" variant="primary" hide-label="sm" @click="openEarnestPanel(earnestActionsFor('contract')[0]?.prompt)">
            Create invoice
          </UiActionButton>
          <div class="inline-flex items-center rounded-lg border border-border bg-background p-0.5 text-xs">
            <button
              class="h-6 px-2.5 rounded-md transition-colors"
              :class="mode === 'view' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="mode = 'view'"
            >
              <EIcon name="lucide:eye" class="w-3.5 h-3.5 inline -mt-0.5" />
              <span class="ml-1 hidden sm:inline">View</span>
            </button>
            <button
              class="h-6 px-2.5 rounded-md transition-colors"
              :class="mode === 'edit' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="mode = 'edit'"
            >
              <EIcon name="lucide:pencil" class="w-3.5 h-3.5 inline -mt-0.5" />
              <span class="ml-1 hidden sm:inline">Edit</span>
            </button>
            <button
              class="h-6 px-2.5 rounded-md transition-colors"
              :class="mode === 'activity' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="mode = 'activity'"
            >
              <EIcon name="lucide:history" class="w-3.5 h-3.5 inline -mt-0.5" />
              <span class="ml-1 hidden sm:inline">Activity</span>
            </button>
          </div>

          <button
            v-if="contract.contract_status === 'draft'"
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            :disabled="sendingForSignature"
            @click="sendForSignature"
          >
            <EIcon
              :name="sendingForSignature ? 'lucide:loader-2' : 'lucide:send'"
              class="w-3.5 h-3.5"
              :class="sendingForSignature ? 'animate-spin' : ''"
            />
            <span class="hidden sm:inline">Send for signature</span>
          </button>
          <button
            v-if="!compact"
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
            @click="sidebarOpen = true"
          >
            <EarnestIcon class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Ask Earnest</span>
          </button>
          <button
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
            @click="showEditModal = true"
          >
            <EIcon name="lucide:settings-2" class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Details</span>
          </button>
        </div>
      </div>

      <!-- Inline-editable details (view/activity only — Edit mode renders its
           own columnar details inside the editor pane below). -->
      <div v-if="mode !== 'edit'" class="ios-card p-5 mb-4">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Details</p>
        <AppsInlineDetailsEditor
          collection="contracts"
          :item-id="String(contract.id)"
          :model-value="detailValues"
          :fields="detailFields"
          :columns="2"
          @updated="onDetailsUpdated"
        />
      </div>

      <!-- Signing-link callout when sent -->
      <div
        v-if="contract.contract_status === 'sent' && contract.signing_token"
        class="ios-card p-4 mb-4 flex items-center justify-between gap-3"
      >
        <div class="min-w-0">
          <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Public signing link</p>
          <p class="text-xs text-foreground truncate">{{ `/contracts/sign/${contract.signing_token}` }}</p>
        </div>
        <button
          class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted shrink-0"
          @click="copySigningLink"
        >
          <EIcon name="lucide:copy" class="w-3.5 h-3.5" />
          Copy link
        </button>
      </div>

      <!-- Signed callout -->
      <div
        v-if="contract.contract_status === 'signed'"
        class="ios-card p-4 mb-4 border-l-4 border-l-green-500"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[10px] uppercase tracking-wider text-success dark:text-success">Signed</p>
            <p class="text-sm text-foreground mt-0.5">
              {{ contract.signed_by_name }} <span class="text-muted-foreground">&lt;{{ contract.signed_by_email }}&gt;</span>
            </p>
            <p class="text-xs text-muted-foreground">
              {{ contract.signed_at ? new Date(contract.signed_at).toLocaleString() : '' }}
            </p>
          </div>
          <!-- Deterministic next step: draft an invoice from this contract. -->
          <button
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
            :disabled="billingContract"
            @click="handleBillContract"
          >
            <EIcon
              :name="billingContract ? 'lucide:loader-2' : 'lucide:receipt'"
              class="w-3.5 h-3.5"
              :class="billingContract ? 'animate-spin' : ''"
            />
            <span class="hidden sm:inline">Bill this contract</span>
          </button>
        </div>
        <p v-if="billedActionId" class="text-xs text-muted-foreground mt-2 flex items-center gap-1">
          <EIcon name="lucide:check-circle-2" class="w-3.5 h-3.5 text-success" />
          Invoice drafted — approve it in AI Activity to send.
        </p>
      </div>

      <!-- Save bar (sticky) when editing blocks -->
      <div
        v-if="mode === 'edit' && blocksDirty"
        class="sticky top-2 z-30 mb-4 flex items-center justify-between gap-2 ios-card p-2.5 bg-warning/10 dark:bg-warning/30 border-l-4 border-l-warning"
      >
        <p class="text-xs text-warning">Unsaved changes to contract blocks.</p>
        <button
          class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="savingBlocks"
          @click="saveBlocks"
        >
          <EIcon
            :name="savingBlocks ? 'lucide:loader-2' : 'lucide:save'"
            class="w-3.5 h-3.5"
            :class="savingBlocks ? 'animate-spin' : ''"
          />
          Save
        </button>
      </div>

      <!-- VIEW mode -->
      <div v-if="mode === 'view'" class="w-full flex flex-col items-center justify-start">
        <DocumentsDocumentShell
          :seller="contract.organization"
          :wrapper-class="compact ? 'px-4 pt-8 pb-12 w-full proposal contract-doc' : 'px-6 pt-12 pb-16 w-full max-w-3xl proposal contract-doc'"
        >
          <DocumentsDocumentHeader :seller="seller" :recipient="recipient" :doc="docMeta">
            <template #actions>
              <ClientOnly>
                <DocumentsDocumentPdfGenerator
                  :filename="(contract.title || 'contract').replace(/\s+/g, '-')"
                  selector=".doc-shell.contract-doc"
                  data-pdf-strip
                />
              </ClientOnly>
            </template>
          </DocumentsDocumentHeader>

          <div v-if="contract.total_value != null" class="mt-6 mb-2 flex items-center justify-between pt-4 doc__total-rule" style="border-top: 1px solid var(--doc-rule);">
            <p class="text-[10px] uppercase tracking-wider opacity-60">Total value</p>
            <p class="text-xl font-bold">{{ formatTotal(contract.total_value) }}</p>
          </div>

          <div v-if="hasBlocks" class="mt-8">
            <DocumentsBlockRenderer :blocks="contract.blocks" :cover="coverContext" />
          </div>
          <div v-else class="mt-12 text-center opacity-50 text-sm">
            This contract has no content yet — switch to Edit mode to add blocks.
          </div>

          <div
            v-if="contract.contract_status === 'signed'"
            class="mt-8 pt-6"
            style="border-top: 1px solid var(--doc-rule);"
          >
            <p class="text-[10px] uppercase tracking-wider opacity-60">Signed</p>
            <p class="text-sm font-medium mt-0.5">
              {{ contract.signed_by_name }}
              <span class="opacity-60 text-xs">&lt;{{ contract.signed_by_email }}&gt;</span>
            </p>
            <p class="text-xs opacity-60">{{ contract.signed_at ? new Date(contract.signed_at).toLocaleString() : '' }}</p>
          </div>

          <DocumentsDocumentFooter :hidden="hideFooter" />
        </DocumentsDocumentShell>
      </div>

      <!-- ACTIVITY mode: AI actions + change history -->
      <div v-else-if="mode === 'activity'" class="max-w-2xl mx-auto w-full">
        <DocumentActivityTimeline collection="contracts" :item-id="String(contract.id)" />
      </div>

      <!-- EDIT mode: editor pane on the left, live document preview on the
           right (large screens). The preview binds to the in-flight `blocks`
           so it updates as you compose. -->
      <div v-else class="grid grid-cols-1 gap-6" :class="{ 'xl:grid-cols-2': !compact }">
        <!-- Editor pane -->
        <div class="space-y-5 min-w-0">
          <!-- Details — columnar inputs for quicker scanning/editing. -->
          <div class="ios-card p-5">
            <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Details</p>
            <AppsInlineDetailsEditor
              collection="contracts"
              :item-id="String(contract.id)"
              :model-value="detailValues"
              :fields="detailFields"
              :columns="2"
              @updated="onDetailsUpdated"
            />
          </div>

          <!-- Contact + source proposal -->
          <div
            v-if="contract.contact || contract.proposal"
            class="grid gap-4"
            :class="{ 'sm:grid-cols-2': contract.contact && contract.proposal }"
          >
            <div v-if="contract.contact" class="ios-card p-5 space-y-1">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Contact</p>
              <p class="text-sm font-medium text-foreground">{{ contract.contact.first_name }} {{ contract.contact.last_name }}</p>
              <p v-if="contract.contact.email" class="text-xs text-muted-foreground">{{ contract.contact.email }}</p>
            </div>
            <div v-if="contract.proposal" class="ios-card p-5">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Source proposal</p>
              <button type="button" class="text-sm text-primary hover:underline" @click="slideOverStack.push('proposal', String(contract.proposal.id))">
                {{ contract.proposal.title || 'View proposal' }} &rarr;
              </button>
            </div>
          </div>

          <!-- External file attachment -->
          <div class="ios-card p-5 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Attachment</p>
              <span class="text-[10px] text-muted-foreground">For contracts drafted outside Earnest</span>
            </div>
            <div v-if="contract.file" class="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
              <EIcon name="i-heroicons-paper-clip" class="w-5 h-5 text-muted-foreground/50 shrink-0" />
              <div class="min-w-0 flex-1">
                <a v-if="attachmentUrl" :href="attachmentUrl" target="_blank" rel="noopener" class="block text-sm font-medium text-foreground truncate hover:text-primary">{{ contract.file.title || 'Attachment' }}</a>
                <p v-else class="text-sm font-medium text-foreground truncate">{{ contract.file.title || 'Attachment' }}</p>
                <p v-if="contract.file.type" class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ contract.file.type }}</p>
              </div>
              <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors" title="Remove attachment" @click="removeAttachment">
                <EIcon name="i-heroicons-trash" class="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              class="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/40 transition-colors disabled:opacity-50"
              :disabled="attaching"
              @click="pickAttachment"
            >
              <EIcon :name="attaching ? 'lucide:loader-2' : 'lucide:upload'" class="w-3.5 h-3.5" :class="attaching ? 'animate-spin' : ''" />
              {{ contract.file ? 'Replace file' : 'Attach a file' }}
            </button>
            <input ref="attachInput" type="file" class="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,application/pdf" @change="onAttachmentSelected" />
          </div>

          <!-- Block composer -->
          <div class="space-y-3">
            <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Contract body</p>
            <DocumentsBlockComposer
              :model-value="blocks"
              applies-to="contracts"
              :saving="savingBlocks"
              @update:model-value="onBlocksChange"
            />
          </div>
        </div>

        <!-- Live preview pane (large screens only) -->
        <div v-if="!compact" class="hidden xl:block">
          <div class="sticky top-4 space-y-2">
            <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Live preview</p>
            <div class="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-border/60 bg-muted/10">
              <DocumentsDocumentShell
                :seller="contract.organization"
                wrapper-class="px-6 pt-10 pb-12 w-full proposal contract-doc-preview"
              >
                <DocumentsDocumentHeader :seller="seller" :recipient="recipient" :doc="docMeta" />
                <div v-if="contract.total_value != null" class="mt-6 mb-2 flex items-center justify-between pt-4" style="border-top: 1px solid var(--doc-rule);">
                  <p class="text-[10px] uppercase tracking-wider opacity-60">Total value</p>
                  <p class="text-xl font-bold">{{ formatTotal(contract.total_value) }}</p>
                </div>
                <div v-if="blocks && blocks.length" class="mt-8">
                  <DocumentsBlockRenderer :blocks="blocks" :cover="coverContext" />
                </div>
                <div v-else class="mt-12 text-center opacity-50 text-sm">
                  Add blocks to see the preview.
                </div>
                <DocumentsDocumentFooter :hidden="hideFooter" />
              </DocumentsDocumentShell>
            </div>
          </div>
        </div>
      </div>

      <ContractsFormModal
        v-model="showEditModal"
        :contract="contract"
        @updated="onContractUpdated"
        @deleted="onContractDeleted"
      />
    </template>

    <!-- Contextual AI Sidebar — full-page mode only. The slide-over panel
         lives inside a transformed container so this fixed overlay would
         not render at viewport level there. -->
  </div>
</template>
