<!--
  DocumentWorkspace — ONE unified builder for proposals AND contracts.

  Replaces the near-duplicate ProposalWorkspace / ContractWorkspace twins and
  collapses their view/edit/activity mode split into a single always-live
  document: the styled document frame IS the editor. Inline-editable metadata
  (title / status / value / dates) sits at the top; the block composer is the
  body; there is no separate "Details" form, no preview pane, and no mode
  toggle. Activity is a toggle, not a destination.

  Parameterised by `type` ('proposal' | 'contract'); all the signing / convert
  / PDF / AI-draft plumbing is preserved and calls the exact same endpoints as
  before. Consumed by `<ProposalPanel>` / `<ContractPanel>` (compact) and the
  `/proposals/[id]` · `/contracts/[id]` routes.
-->
<script setup lang="ts">
import { PROPOSAL_STATUS_LABELS } from '~~/shared/proposals-enhanced';
import { CONTRACT_STATUS_LABELS } from '~~/shared/contracts';
import { shouldHideEarnestFooter } from '~~/shared/branding';

const props = defineProps<{
  type: 'proposal' | 'contract';
  documentId: string;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'loaded', doc: any): void;
  (e: 'back'): void;
}>();

const isProposal = computed(() => props.type === 'proposal');
const collection = props.type === 'proposal' ? 'proposals' : 'contracts';
const appliesTo = collection; // BlockComposer `applies-to` value
const STATUS_LABELS = props.type === 'proposal' ? PROPOSAL_STATUS_LABELS : CONTRACT_STATUS_LABELS;
const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label: String(label) }));

const router = useRouter();
const route = useRoute();
const config = useRuntimeConfig();
const { getProposal } = useProposals();
const { getContract } = useContracts();
const getDoc = props.type === 'proposal' ? getProposal : getContract;
const { getStatusBadgeClasses } = useStatusStyle();
const { setEntity, clearEntity, sidebarOpen } = useEntityPageContext();
const slideOverStack = useAppSlideOverStack();
const docItems = useDirectusItems(collection);
const toast = useToast();
const { celebrateProposal, celebrateContract } = useProposalEncouragement();

const doc = ref<any>(null);
const loading = ref(true);

const blocks = ref<any[]>([]);
const blocksDirty = ref(false);
const savingBlocks = ref(false);
const hasBlocks = computed(() => Array.isArray(blocks.value) && blocks.value.length > 0);

// The body renders the live document by default (reflecting in-flight edits, so
// it IS the preview). "Edit content" reveals the composer inline — no separate
// mode, no separate pane. Auto-open for an empty document so there's somewhere
// to start.
const editingContent = ref(false);

// Activity is a toggle over the document, not a separate mode.
const showActivity = ref(false);

async function fetchData() {
  loading.value = true;
  try {
    doc.value = await getDoc(props.documentId);
    blocks.value = Array.isArray(doc.value?.blocks) ? doc.value.blocks : [];
    blocksDirty.value = false;
    // Start in edit for an empty document (nothing to preview yet).
    editingContent.value = blocks.value.length === 0 && !doc.value?.notes;
    if (!props.compact) {
      useHead({ title: `${doc.value?.title || (isProposal.value ? 'Proposal' : 'Contract')} | Earnest` });
    }
    if (doc.value) emit('loaded', doc.value);
  } catch (e) {
    console.error(`Failed to load ${props.type}:`, e);
  } finally {
    loading.value = false;
  }
}

function onBlocksChange(next: any[]) {
  blocks.value = next;
  blocksDirty.value = true;
  scheduleAutosave();
}

// Debounced autosave so block edits are never lost to a navigation. Fires ~1.4s
// after the last change; the manual Save button still forces an instant save.
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { if (blocksDirty.value && !savingBlocks.value) void saveBlocks(true); }, 1400);
}

async function saveBlocks(silent = false) {
  if (!doc.value?.id || savingBlocks.value) return;
  if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
  savingBlocks.value = true;
  try {
    await docItems.update(doc.value.id, { blocks: blocks.value });
    doc.value = { ...doc.value, blocks: [...blocks.value] };
    blocksDirty.value = false;
    if (!silent) toast.add({ title: 'Saved', color: 'green' });
  } catch (err: any) {
    toast.add({ title: 'Failed to save', description: err.message, color: 'red' });
  } finally {
    savingBlocks.value = false;
  }
}

/* ── Draft with Earnest (Generative Canvas overlay) ── */
const showEarnestDraft = ref(false);
function onEarnestApply(entries: any[]) {
  blocks.value = entries;
  blocksDirty.value = true;
  showEarnestDraft.value = false;
  scheduleAutosave();
}

/* ── Primary action: convert (proposal) / send-for-signature (contract) ── */
const converting = ref(false);
async function convertToContract() {
  if (!doc.value?.id || converting.value) return;
  converting.value = true;
  try {
    const res: any = await $fetch(`/api/contracts/from-proposal/${doc.value.id}`, { method: 'POST' });
    if (res?.id) {
      toast.add({ title: 'Contract drafted from proposal', color: 'green' });
      if (props.compact) slideOverStack.push('contract', String(res.id));
      else router.push(`/apps/money?floor=documents&tab=contracts&slide=contract:${res.id}`);
    }
  } catch (err: any) {
    toast.add({ title: 'Failed to convert', description: err?.data?.message || err?.message, color: 'red' });
  } finally {
    converting.value = false;
  }
}

const sendingForSignature = ref(false);
async function sendForSignature() {
  if (!doc.value?.id || sendingForSignature.value) return;
  sendingForSignature.value = true;
  try {
    const res = await $fetch<{ status: string; signing_token: string; url: string; transmitted: boolean; recipient?: string; reason?: string }>(
      `/api/contracts/${doc.value.id}/send`,
      { method: 'POST' },
    );
    doc.value = {
      ...doc.value,
      contract_status: res.status,
      signing_token: res.signing_token,
      date_sent: doc.value.date_sent || new Date().toISOString().split('T')[0],
    };
    if (res.transmitted) {
      toast.add({ title: `Sent for signature to ${res.recipient || 'the contact'}`, color: 'green' });
    } else if (res.url) {
      try { await navigator.clipboard.writeText(res.url); } catch { /* ignore */ }
      toast.add({ title: 'Signing link copied', description: 'Email delivery is off for this org — paste the link to the client.', color: 'green' });
    }
    celebrateContract({ status: res.status });
    emit('loaded', doc.value);
  } catch (err: any) {
    toast.add({ title: 'Failed to send', description: err?.data?.message || err?.message, color: 'red' });
  } finally {
    sendingForSignature.value = false;
  }
}

/* ── Document-shell context (seller / recipient / meta / cover) ── */
const seller = computed(() => {
  const o: any = doc.value?.organization;
  if (!o) return null;
  return { name: o.name, logo: o.logo, address: o.address, phone: o.phone, email: o.email, website: o.website };
});

const recipient = computed(() => {
  const c: any = doc.value?.contact;
  if (!c) return null;
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return { name: c.company || name || null, address: null as string | null, emails: c.email ? [c.email] : null };
});

const docMeta = computed(() => ({
  kind: isProposal.value ? 'PROPOSAL' : 'CONTRACT',
  code: doc.value?.id ? `${isProposal.value ? 'P' : 'C'}-${String(doc.value.id).slice(0, 8)}` : null,
  date: doc.value?.date_sent || doc.value?.date_created,
  dateLabel: 'Sent',
  expiresAt: isProposal.value ? doc.value?.valid_until : null,
  expiresLabel: 'Valid until',
  status: isProposal.value ? doc.value?.proposal_status : doc.value?.contract_status,
}));

const coverContext = computed(() => {
  const o: any = doc.value?.organization;
  const logo = o?.logo;
  const logoId = typeof logo === 'string' ? logo : logo?.id;
  return {
    logoUrl: logoId ? `${config.public.directusUrl}/assets/${logoId}?key=medium-contain` : null,
    title: doc.value?.title || null,
    recipient: recipient.value?.name || null,
    dateSent: doc.value?.date_sent || doc.value?.date_created || null,
    dateLabel: 'Sent',
    expiresAt: (isProposal.value ? doc.value?.valid_until : null) || null,
    expiresLabel: 'Valid until',
  };
});

const hideFooter = computed(() => shouldHideEarnestFooter({
  whitelabel: doc.value?.organization?.whitelabel,
  plan: doc.value?.organization?.plan,
  active_addons: doc.value?.organization?.active_addons,
}));

const statusValue = computed(() => isProposal.value ? doc.value?.proposal_status : doc.value?.contract_status);

function formatTotal(n: number | null | undefined) {
  if (n == null) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

/* ── Inline metadata (single Details surface) ── */
const statusKey = isProposal.value ? 'proposal_status' : 'contract_status';
const detailValues = computed(() => ({
  title: doc.value?.title ?? '',
  [statusKey]: statusValue.value ?? '',
  total_value: doc.value?.total_value ?? '',
  ...(isProposal.value ? { valid_until: doc.value?.valid_until ? String(doc.value.valid_until).slice(0, 10) : '' } : {}),
  date_sent: doc.value?.date_sent ? String(doc.value.date_sent).slice(0, 10) : '',
}));

const detailFields = computed(() => [
  { key: 'title', label: 'Title', type: 'text' as const, placeholder: `${isProposal.value ? 'Proposal' : 'Contract'} title`, full: true },
  { key: statusKey, label: 'Status', type: 'select' as const, options: STATUS_OPTIONS },
  { key: 'total_value', label: 'Value', type: 'number' as const, prefix: '$' },
  ...(isProposal.value ? [{ key: 'valid_until', label: 'Valid until', type: 'date' as const }] : []),
  { key: 'date_sent', label: 'Sent', type: 'date' as const },
]);

function onDetailsUpdated(patch: Record<string, any>) {
  if (!doc.value) return;
  // Celebrate a genuine forward status move (draft → sent, or a win) — but only
  // when the status actually changed, so routine edits stay quiet.
  if (isProposal.value && 'proposal_status' in patch) {
    const prev = doc.value.proposal_status;
    const next = patch.proposal_status;
    if (next && next !== prev && ['sent', 'viewed', 'accepted'].includes(next)) {
      celebrateProposal({ status: next });
    }
  }
  Object.assign(doc.value, patch);
  emit('loaded', doc.value);
}

/* ── External file attachment (drafted-outside-Earnest escape hatch) ── */
const { upload: uploadDirectusFile } = useDirectusFiles();
const attachInput = ref<HTMLInputElement | null>(null);
const attaching = ref(false);
const attachmentUrl = computed(() =>
  doc.value?.file?.id ? `${config.public.directusUrl}/assets/${doc.value.file.id}?download` : null,
);
const isPdfAttachment = computed(() => {
  const f = doc.value?.file;
  if (!f) return false;
  return (f.type || '').includes('pdf') || /\.pdf$/i.test(f.title || '');
});
function pickAttachment() { attachInput.value?.click(); }
async function onAttachmentSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !doc.value?.id) return;
  attaching.value = true;
  try {
    const res: any = await uploadDirectusFile(file, { title: file.name });
    const rec = res?.data || res;
    const fileId = rec?.id;
    if (!fileId) throw new Error('Upload returned no file id');
    await docItems.update(doc.value.id, { file: fileId });
    doc.value = { ...doc.value, file: { id: fileId, title: rec.title || file.name, type: rec.type || file.type, filesize: rec.filesize } };
    toast.add({ title: 'File attached', color: 'green' });
  } catch (err: any) {
    toast.add({ title: 'Could not attach file', description: err?.data?.message || err?.message, color: 'red' });
  } finally {
    attaching.value = false;
    if (input) input.value = '';
  }
}
async function removeAttachment() {
  if (!doc.value?.id) return;
  try {
    await docItems.update(doc.value.id, { file: null });
    doc.value = { ...doc.value, file: null };
  } catch (err: any) {
    toast.add({ title: 'Could not remove attachment', description: err?.data?.message || err?.message, color: 'red' });
  }
}

if (!props.compact) {
  useMarkItemRead(collection, toRef(() => props.documentId));
}

onMounted(fetchData);
// Flush any pending edits before switching documents (slide-over stack) so a
// dirty doc is never silently discarded when documentId changes.
watch(() => props.documentId, async () => {
  if (blocksDirty.value) await saveBlocks(true).catch(() => {});
  doc.value = null; showActivity.value = false; fetchData();
});

// Belt-and-suspenders against data loss: warn on tab close, and flush on unmount.
function beforeUnloadGuard(e: BeforeUnloadEvent) { if (blocksDirty.value) { e.preventDefault(); e.returnValue = ''; } }
onMounted(() => { if (import.meta.client) window.addEventListener('beforeunload', beforeUnloadGuard); });
onBeforeUnmount(() => {
  if (import.meta.client) window.removeEventListener('beforeunload', beforeUnloadGuard);
  if (autosaveTimer) clearTimeout(autosaveTimer);
  if (blocksDirty.value && !savingBlocks.value) void saveBlocks(true);
});

if (!props.compact) {
  watch(doc, (d) => { if (d) setEntity(props.type, String(d.id), d.title || (isProposal.value ? 'Proposal' : 'Contract')); }, { immediate: true });
  onUnmounted(() => clearEntity());
}
</script>

<template>
  <div>
    <div v-if="loading" class="flex items-center justify-center py-20">
      <EIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-muted-foreground/40" />
    </div>

    <template v-else-if="doc">
      <NuxtLink
        v-if="!compact"
        :to="`/apps/money?floor=documents${isProposal ? '' : '&tab=contracts'}`"
        class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mt-4 mb-2"
      >
        <EIcon name="lucide:chevron-left" class="w-3 h-3" />
        {{ isProposal ? 'Proposals' : 'Contracts' }}
      </NuxtLink>

      <!-- Single action bar. No mode toggle — the document below is always live. -->
      <div class="flex items-center justify-between gap-3 flex-wrap mb-4" :class="{ 'mt-1': compact }">
        <div class="flex items-center gap-2 min-w-0">
          <span
            v-if="statusValue"
            class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize shrink-0"
            :class="getStatusBadgeClasses(statusValue)"
          >
            {{ STATUS_LABELS[statusValue as keyof typeof STATUS_LABELS] || statusValue }}
          </span>
          <span v-if="blocksDirty" class="text-[10px] uppercase tracking-wider text-warning">Unsaved</span>
        </div>

        <div class="flex items-center gap-1.5 flex-wrap">
          <!-- Save (only when dirty) -->
          <button
            v-if="blocksDirty"
            class="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            :disabled="savingBlocks"
            @click="saveBlocks()"
          >
            <EIcon :name="savingBlocks ? 'lucide:loader-2' : 'lucide:save'" class="w-3.5 h-3.5" :class="savingBlocks ? 'animate-spin' : ''" />
            Save
          </button>

          <button
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border text-xs font-medium hover:bg-muted transition-colors"
            @click="showEarnestDraft = true"
          >
            <Icon name="lucide:sparkles" class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Draft with Earnest</span>
            <AiSpendMark muted />
          </button>

          <!-- Primary: send for signature (contract) / convert (proposal) -->
          <button
            v-if="isProposal"
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
            :disabled="converting"
            @click="convertToContract"
          >
            <EIcon :name="converting ? 'lucide:loader-2' : 'lucide:file-signature'" class="w-3.5 h-3.5" :class="converting ? 'animate-spin' : ''" />
            <span class="hidden sm:inline">Convert to contract</span>
          </button>
          <button
            v-else
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            :disabled="sendingForSignature"
            @click="sendForSignature"
          >
            <EIcon :name="sendingForSignature ? 'lucide:loader-2' : 'lucide:send'" class="w-3.5 h-3.5" :class="sendingForSignature ? 'animate-spin' : ''" />
            <span class="hidden sm:inline">Send for signature</span>
          </button>

          <button
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-xs font-medium transition-colors"
            :class="showActivity ? 'border-primary/40 text-primary bg-primary/10' : 'border-border hover:bg-muted'"
            @click="showActivity = !showActivity"
          >
            <EIcon name="lucide:history" class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Activity</span>
          </button>

          <button
            v-if="!compact"
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
            @click="sidebarOpen = true"
          >
            <EarnestIcon class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Ask Earnest</span>
          </button>
        </div>
      </div>

      <ClientOnly>
        <AIProactiveNotices v-if="doc?.id" :entity-type="type" :entity-id="String(doc.id)" />
      </ClientOnly>

      <!-- Activity drawer (toggle, not a mode) -->
      <div v-if="showActivity" class="ios-card p-5 mb-5">
        <DocumentActivityTimeline :collection="collection" :item-id="String(doc.id)" />
      </div>

      <!-- THE document — one always-live surface. Styled header + inline
           metadata + the composer body, all inside the document frame. -->
      <div class="w-full flex flex-col items-center justify-start">
        <DocumentsDocumentShell
          :seller="doc.organization"
          :wrapper-class="compact ? 'px-4 pt-8 pb-12 w-full proposal proposal-doc' : 'px-6 pt-12 pb-16 w-full max-w-3xl proposal proposal-doc'"
        >
          <DocumentsDocumentHeader :seller="seller" :recipient="recipient" :doc="docMeta">
            <template #actions>
              <ClientOnly>
                <DocumentsDocumentPdfGenerator
                  :filename="(doc.title || type).replace(/\s+/g, '-')"
                  selector=".doc-shell.proposal-doc"
                  data-pdf-strip
                />
              </ClientOnly>
            </template>
          </DocumentsDocumentHeader>

          <!-- Inline metadata — the single editable Details surface, hidden
               from the exported PDF. -->
          <div class="mt-6 rounded-2xl border border-border/60 bg-muted/10 p-4" data-pdf-strip>
            <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Details</p>
            <AppsInlineDetailsEditor
              :collection="collection"
              :item-id="String(doc.id)"
              :model-value="detailValues"
              :fields="detailFields"
              :columns="2"
              @updated="onDetailsUpdated"
            />
          </div>

          <div v-if="doc.total_value != null" class="mt-6 mb-2 flex items-center justify-between pt-4" style="border-top: 1px solid var(--doc-rule);">
            <p class="text-[10px] uppercase tracking-wider opacity-60">Total investment</p>
            <p class="text-xl font-bold">{{ formatTotal(doc.total_value) }}</p>
          </div>

          <!-- Content — the live-rendered document by default (reflects in-flight
               `blocks`, so it doubles as the preview). "Edit content" reveals the
               composer inline; no separate mode, no separate pane. -->
          <div class="mt-8">
            <div class="flex items-center justify-between mb-3" data-pdf-strip>
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ isProposal ? 'Proposal' : 'Contract' }} content</p>
              <button
                class="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-medium border transition-colors"
                :class="editingContent ? 'border-primary/40 text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'"
                @click="editingContent = !editingContent"
              >
                <Icon :name="editingContent ? 'lucide:check' : 'lucide:pencil'" class="w-3 h-3" />
                {{ editingContent ? 'Done editing' : 'Edit content' }}
              </button>
            </div>

            <DocumentsBlockComposer
              v-if="editingContent"
              data-pdf-strip
              :model-value="blocks"
              :applies-to="appliesTo"
              :saving="savingBlocks"
              @update:model-value="onBlocksChange"
            />
            <template v-else>
              <DocumentsBlockRenderer v-if="hasBlocks" :blocks="blocks" :cover="coverContext" />
              <!-- Logged-from-PDF: the attachment IS the document. Show it front and
                   centre rather than an "add blocks" empty state. -->
              <div v-else-if="doc.file && attachmentUrl" class="py-4">
                <div class="rounded-2xl border border-border/60 bg-muted/20 overflow-hidden">
                  <iframe
                    v-if="isPdfAttachment"
                    :src="attachmentUrl"
                    class="w-full h-[70vh] bg-white"
                    title="Attached document"
                  />
                  <div class="flex items-center gap-3 px-4 py-3 border-t border-border/50">
                    <EIcon name="i-heroicons-document-text" class="w-5 h-5 text-muted-foreground shrink-0" />
                    <div class="min-w-0 flex-1">
                      <div class="text-sm font-medium truncate">{{ doc.file.title || 'Attached document' }}</div>
                      <div class="text-[11px] uppercase tracking-wide text-muted-foreground">Logged from an external file</div>
                    </div>
                    <a :href="attachmentUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border bg-background text-xs hover:bg-muted/40 transition-colors shrink-0">
                      <EIcon name="i-heroicons-arrow-down-tray" class="w-3.5 h-3.5" />
                      Open
                    </a>
                  </div>
                </div>
              </div>
              <div v-else-if="doc.notes" class="prose prose-sm dark:prose-invert max-w-none" v-html="doc.notes" />
              <div v-else class="py-10 text-center opacity-50 text-sm">No content yet — click “Edit content” to add blocks.</div>
            </template>
          </div>

          <!-- Attachment (drafted-outside-Earnest escape hatch), compact. -->
          <div class="mt-6 flex items-center gap-2 flex-wrap" data-pdf-strip>
            <a
              v-if="doc.file && attachmentUrl"
              :href="attachmentUrl"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border bg-muted/20 text-xs text-foreground hover:bg-muted/40 transition-colors"
            >
              <EIcon name="i-heroicons-paper-clip" class="w-3.5 h-3.5 text-muted-foreground" />
              {{ doc.file.title || 'Attachment' }}
            </a>
            <button v-if="doc.file" type="button" class="text-muted-foreground hover:text-destructive text-xs" @click="removeAttachment">Remove</button>
            <button
              v-else
              type="button"
              class="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
              :disabled="attaching"
              @click="pickAttachment"
            >
              <EIcon :name="attaching ? 'lucide:loader-2' : 'lucide:upload'" class="w-3.5 h-3.5" :class="attaching ? 'animate-spin' : ''" />
              Attach an external file
            </button>
            <input ref="attachInput" type="file" class="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,application/pdf" @change="onAttachmentSelected" />
          </div>

          <DocumentsDocumentFooter :hidden="hideFooter" />
        </DocumentsDocumentShell>
      </div>
    </template>

    <!-- Draft with Earnest — full-screen Generative Canvas overlay. -->
    <Teleport to="body">
      <div v-if="showEarnestDraft" class="pw-earnest-overlay">
        <DocumentsDocumentGenerativeCanvas
          embedded
          :initial-blocks="blocks"
          :brief="doc?.title ? `${isProposal ? 'Proposal' : 'Contract'}: ${doc.title}` : undefined"
          @apply="onEarnestApply"
          @close="showEarnestDraft = false"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.pw-earnest-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  padding: clamp(0.5rem, 2vw, 1.5rem);
  background: rgba(6, 10, 18, 0.55);
  backdrop-filter: blur(4px);
}
.pw-earnest-overlay > * { height: 100%; }
</style>
