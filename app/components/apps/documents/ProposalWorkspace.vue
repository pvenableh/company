<!--
  ProposalWorkspace — shared body for the proposal detail surface.

  Consumed by both the `/proposals/[id]` full-page route AND the
  `proposal` slide-over panel (`<ProposalPanel>`). Pass `:proposalId`;
  the component fetches itself. Emits `@loaded` with the proposal
  record (panel uses it to populate the slide-over shell title).

  `:compact` hides chrome the slide-over shell already provides (back
  link + inline h1/subtitle + Ask Earnest button + AI sidebar overlay,
  which would render inside the slide-over's transformed container
  instead of at viewport level — see [AppSlideOverShell.vue]).
-->
<script setup lang="ts">
import { PROPOSAL_STATUS_LABELS } from '~~/shared/proposals-enhanced';
import { shouldHideEarnestFooter } from '~~/shared/branding';

const props = defineProps<{
  proposalId: string;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'loaded', proposal: any): void;
  (e: 'back'): void;
}>();

const router = useRouter();
const config = useRuntimeConfig();
const { getProposal } = useProposals();
const { getStatusBadgeClasses } = useStatusStyle();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();
const slideOverStack = useAppSlideOverStack();

const proposal = ref<any>(null);
const loading = ref(true);
const showEditModal = ref(false);
const proposalItems = useDirectusItems('proposals');
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
    proposal.value = await getProposal(props.proposalId);
    blocks.value = Array.isArray(proposal.value?.blocks) ? proposal.value.blocks : [];
    blocksDirty.value = false;
    if (!props.compact) {
      useHead({ title: `${proposal.value?.title || 'Proposal'} | Earnest` });
    }
    if (proposal.value) emit('loaded', proposal.value);
  } catch (e) {
    console.error('Failed to load proposal:', e);
  } finally {
    loading.value = false;
  }
}

function onBlocksChange(next: any[]) {
  blocks.value = next;
  blocksDirty.value = true;
}

async function saveBlocks() {
  if (!proposal.value?.id || savingBlocks.value) return;
  savingBlocks.value = true;
  try {
    await proposalItems.update(proposal.value.id, { blocks: blocks.value });
    proposal.value = { ...proposal.value, blocks: [...blocks.value] };
    blocksDirty.value = false;
    toast.add({ title: 'Saved', color: 'green' });
  } catch (err: any) {
    toast.add({ title: 'Failed to save blocks', description: err.message, color: 'red' });
  } finally {
    savingBlocks.value = false;
  }
}

function onProposalUpdated(updated: any) {
  proposal.value = { ...proposal.value, ...updated };
  emit('loaded', proposal.value);
}

// Draft with Earnest — conversational Generative Canvas, embedded. It seeds
// from the current blocks and hands edited blocks back; our existing sticky
// Save bar persists them (nothing is written until the user hits Save).
const showEarnestDraft = ref(false);
function onEarnestApply(entries: any[]) {
  blocks.value = entries;
  blocksDirty.value = true;
  showEarnestDraft.value = false;
}

function onProposalDeleted() {
  if (props.compact) {
    emit('back');
  } else {
    router.push('/apps/money?floor=documents');
  }
}

const converting = ref(false);
async function convertToContract() {
  if (!proposal.value?.id || converting.value) return;
  converting.value = true;
  try {
    const res = await $fetch(`/api/contracts/from-proposal/${proposal.value.id}`, { method: 'POST' });
    if ((res as any)?.id) {
      toast.add({ title: 'Contract drafted from proposal', color: 'green' });
      if (props.compact) {
        // Push the contract panel on top of this proposal panel.
        slideOverStack.push('contract', String((res as any).id));
      } else {
        // Standalone mode → land the user in the apps shell with the new
        // contract opened as a slide-over over the Documents floor.
        router.push(
          `/apps/money?floor=documents&tab=contracts&slide=contract:${(res as any).id}`,
        );
      }
    }
  } catch (err: any) {
    toast.add({ title: 'Failed to convert', description: err?.data?.message || err?.message, color: 'red' });
  } finally {
    converting.value = false;
  }
}

const seller = computed(() => {
  const o: any = proposal.value?.organization;
  if (!o) return null;
  return {
    name: o.name,
    logo: o.logo,
    address: o.address,
    phone: o.phone,
    email: o.email,
    website: o.website,
  };
});

const recipient = computed(() => {
  const c: any = proposal.value?.contact;
  if (!c) return null;
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  return {
    name: c.company || name || null,
    address: null as string | null,
    emails: c.email ? [c.email] : null,
  };
});

const docMeta = computed(() => ({
  kind: 'PROPOSAL',
  code: proposal.value?.id ? `P-${String(proposal.value.id).slice(0, 8)}` : null,
  date: proposal.value?.date_sent || proposal.value?.date_created,
  dateLabel: 'Sent',
  expiresAt: proposal.value?.valid_until,
  expiresLabel: 'Valid until',
  status: proposal.value?.proposal_status,
}));

const hasBlocks = computed(() => Array.isArray(proposal.value?.blocks) && proposal.value.blocks.length > 0);

const coverContext = computed(() => {
  const o: any = proposal.value?.organization;
  const logo = o?.logo;
  const logoId = typeof logo === 'string' ? logo : logo?.id;
  return {
    logoUrl: logoId ? `${config.public.directusUrl}/assets/${logoId}?key=medium-contain` : null,
    title: proposal.value?.title || null,
    recipient: recipient.value?.name || null,
    dateSent: proposal.value?.date_sent || proposal.value?.date_created || null,
    dateLabel: 'Sent',
    expiresAt: proposal.value?.valid_until || null,
    expiresLabel: 'Valid until',
  };
});

const hideFooter = computed(() => shouldHideEarnestFooter({
  whitelabel: proposal.value?.organization?.whitelabel,
  plan: proposal.value?.organization?.plan,
}));

function formatTotal(n: number | null | undefined) {
  if (n == null) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));
}

// ── Inline-editable Details ───────────────────────────────────────
const detailValues = computed(() => ({
  title: proposal.value?.title ?? '',
  proposal_status: proposal.value?.proposal_status ?? '',
  total_value: proposal.value?.total_value ?? '',
  valid_until: proposal.value?.valid_until ? String(proposal.value.valid_until).slice(0, 10) : '',
  date_sent: proposal.value?.date_sent ? String(proposal.value.date_sent).slice(0, 10) : '',
}));

const detailFields = [
  { key: 'title', label: 'Title', type: 'text' as const, placeholder: 'Proposal title' },
  {
    key: 'proposal_status', label: 'Status', type: 'select' as const,
    options: [
      { value: 'draft', label: 'Draft' },
      { value: 'sent', label: 'Sent' },
      { value: 'viewed', label: 'Viewed' },
      { value: 'accepted', label: 'Accepted' },
      { value: 'rejected', label: 'Rejected' },
      { value: 'expired', label: 'Expired' },
    ],
  },
  { key: 'total_value', label: 'Value', type: 'number' as const, prefix: '$' },
  { key: 'valid_until', label: 'Valid until', type: 'date' as const },
  { key: 'date_sent', label: 'Sent', type: 'date' as const },
];

function onDetailsUpdated(patch: Record<string, any>) {
  if (!proposal.value) return;
  Object.assign(proposal.value, patch);
  emit('loaded', proposal.value);
}

// ── External file attachment ──────────────────────────────────────
// Proposals drafted outside Earnest can be attached here — we upload the
// file to Directus and set the proposal's `file` relation. (Earnest-drafted
// proposals use the block composer instead; this is the escape hatch.)
const { upload: uploadDirectusFile } = useDirectusFiles();
const attachInput = ref<HTMLInputElement | null>(null);
const attaching = ref(false);
const attachmentUrl = computed(() =>
  proposal.value?.file?.id ? `${config.public.directusUrl}/assets/${proposal.value.file.id}?download` : null,
);

function pickAttachment() {
  attachInput.value?.click();
}

async function onAttachmentSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !proposal.value?.id) return;
  attaching.value = true;
  try {
    const res: any = await uploadDirectusFile(file, { title: file.name });
    const rec = res?.data || res;
    const fileId = rec?.id;
    if (!fileId) throw new Error('Upload returned no file id');
    await proposalItems.update(proposal.value.id, { file: fileId });
    proposal.value = {
      ...proposal.value,
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
  if (!proposal.value?.id) return;
  try {
    await proposalItems.update(proposal.value.id, { file: null });
    proposal.value = { ...proposal.value, file: null };
  } catch (err: any) {
    toast.add({ title: 'Could not remove attachment', description: err?.data?.message || err?.message, color: 'red' });
  }
}

if (!props.compact) {
  useMarkItemRead('proposals', toRef(() => props.proposalId));
}

onMounted(fetchData);
watch(() => props.proposalId, () => {
  proposal.value = null;
  fetchData();
});

if (!props.compact) {
  watch(proposal, (p) => {
    if (!p) return;
    setEntity('proposal', String(p.id), p.title || 'Proposal');
  }, { immediate: true });
  onUnmounted(() => clearEntity());
}
</script>

<template>
  <div>
    <div v-if="loading" class="flex items-center justify-center py-20">
      <EIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-muted-foreground/40" />
    </div>

    <template v-else-if="proposal">
      <NuxtLink
        v-if="!compact"
        to="/apps/money?floor=documents"
        class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mt-4 mb-2"
      >
        <EIcon name="lucide:chevron-left" class="w-3 h-3" />
        Proposals
      </NuxtLink>

      <!-- Action bar -->
      <div class="flex items-center justify-between mb-5 gap-3 flex-wrap" :class="{ 'mt-2': compact }">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 v-if="!compact" class="text-base font-semibold truncate">{{ proposal.title || 'Untitled Proposal' }}</h1>
            <span
              v-if="proposal.proposal_status"
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
              :class="getStatusBadgeClasses(proposal.proposal_status)"
            >
              {{ PROPOSAL_STATUS_LABELS[proposal.proposal_status as keyof typeof PROPOSAL_STATUS_LABELS] || proposal.proposal_status }}
            </span>
          </div>
          <p v-if="!compact" class="text-xs text-muted-foreground">
            {{ proposal.organization?.name }}
            <span v-if="proposal.contact"> · {{ proposal.contact.first_name }} {{ proposal.contact.last_name }}</span>
          </p>
        </div>
        <div class="flex items-center gap-1.5 flex-wrap">
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
            v-if="!compact"
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
            @click="sidebarOpen = true"
          >
            <EarnestIcon class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Ask Earnest</span>
          </button>
          <button
            class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
            :disabled="converting"
            @click="convertToContract"
          >
            <EIcon
              :name="converting ? 'lucide:loader-2' : 'lucide:file-signature'"
              class="w-3.5 h-3.5"
              :class="converting ? 'animate-spin' : ''"
            />
            <span class="hidden sm:inline">Convert to contract</span>
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

      <!-- AI Notices -->
      <ClientOnly>
        <AIProactiveNotices v-if="proposal?.id" entity-type="proposal" :entity-id="String(proposal.id)" />
      </ClientOnly>

      <!-- Inline-editable details (view/activity only — Edit mode renders its
           own columnar details inside the editor pane below). -->
      <div v-if="mode !== 'edit'" class="ios-card p-5 mb-5">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Details</p>
        <AppsInlineDetailsEditor
          collection="proposals"
          :item-id="String(proposal.id)"
          :model-value="detailValues"
          :fields="detailFields"
          :columns="2"
          @updated="onDetailsUpdated"
        />
      </div>

      <!-- Save bar (sticky) when editing blocks -->
      <div
        v-if="mode === 'edit' && blocksDirty"
        class="sticky top-2 z-30 mb-4 flex items-center justify-between gap-2 ios-card p-2.5 bg-warning/10 dark:bg-warning/30 border-l-4 border-l-warning"
      >
        <p class="text-xs text-warning">Unsaved changes to proposal blocks.</p>
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

      <!-- VIEW mode: rendered document -->
      <div v-if="mode === 'view'" class="w-full flex flex-col items-center justify-start">
        <DocumentsDocumentShell
          :seller="proposal.organization"
          :wrapper-class="compact ? 'px-4 pt-8 pb-12 w-full proposal proposal-doc' : 'px-6 pt-12 pb-16 w-full max-w-3xl proposal proposal-doc'"
        >
          <DocumentsDocumentHeader :seller="seller" :recipient="recipient" :doc="docMeta">
            <template #actions>
              <ClientOnly>
                <DocumentsDocumentPdfGenerator
                  :filename="(proposal.title || 'proposal').replace(/\s+/g, '-')"
                  selector=".doc-shell.proposal-doc"
                  data-pdf-strip
                />
              </ClientOnly>
            </template>
          </DocumentsDocumentHeader>

          <div v-if="proposal.total_value != null" class="mt-6 mb-2 flex items-center justify-between pt-4 doc__total-rule" style="border-top: 1px solid var(--doc-rule);">
            <p class="text-[10px] uppercase tracking-wider opacity-60">Total investment</p>
            <p class="text-xl font-bold">{{ formatTotal(proposal.total_value) }}</p>
          </div>

          <div v-if="hasBlocks" class="mt-8">
            <DocumentsBlockRenderer :blocks="proposal.blocks" :cover="coverContext" />
          </div>
          <div v-else-if="proposal.notes" class="mt-8 prose prose-sm dark:prose-invert max-w-none" v-html="proposal.notes" />
          <div v-else class="mt-12 text-center opacity-50 text-sm">
            This proposal has no content yet — switch to Edit mode to add blocks.
          </div>

          <DocumentsDocumentFooter :hidden="hideFooter" />
        </DocumentsDocumentShell>
      </div>

      <!-- ACTIVITY mode: AI actions + change history -->
      <div v-else-if="mode === 'activity'" class="max-w-2xl mx-auto w-full">
        <DocumentActivityTimeline collection="proposals" :item-id="String(proposal.id)" />
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
              collection="proposals"
              :item-id="String(proposal.id)"
              :model-value="detailValues"
              :fields="detailFields"
              :columns="2"
              @updated="onDetailsUpdated"
            />
          </div>

          <!-- Contact + linked lead -->
          <div
            v-if="proposal.contact || proposal.lead"
            class="grid gap-4"
            :class="{ 'sm:grid-cols-2': proposal.contact && proposal.lead }"
          >
            <div v-if="proposal.contact" class="ios-card p-5 space-y-1">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Contact</p>
              <p class="text-sm font-medium text-foreground">{{ proposal.contact.first_name }} {{ proposal.contact.last_name }}</p>
              <p v-if="proposal.contact.email" class="text-xs text-muted-foreground">{{ proposal.contact.email }}</p>
              <p v-if="proposal.contact.phone" class="text-xs text-muted-foreground">{{ proposal.contact.phone }}</p>
            </div>
            <div v-if="proposal.lead" class="ios-card p-5">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Linked lead</p>
              <button type="button" @click="slideOverStack.push('lead', proposal.lead.id)" class="text-sm text-primary hover:underline">
                View lead &rarr;
              </button>
            </div>
          </div>

          <!-- External file attachment -->
          <div class="ios-card p-5 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Attachment</p>
              <span class="text-[10px] text-muted-foreground">For proposals drafted outside Earnest</span>
            </div>
            <div v-if="proposal.file" class="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
              <EIcon name="i-heroicons-paper-clip" class="w-5 h-5 text-muted-foreground/50 shrink-0" />
              <div class="min-w-0 flex-1">
                <a v-if="attachmentUrl" :href="attachmentUrl" target="_blank" rel="noopener" class="block text-sm font-medium text-foreground truncate hover:text-primary">{{ proposal.file.title || 'Attachment' }}</a>
                <p v-else class="text-sm font-medium text-foreground truncate">{{ proposal.file.title || 'Attachment' }}</p>
                <p v-if="proposal.file.type" class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ proposal.file.type }}</p>
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
              {{ proposal.file ? 'Replace file' : 'Attach a file' }}
            </button>
            <input ref="attachInput" type="file" class="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,application/pdf" @change="onAttachmentSelected" />
          </div>

          <!-- Block composer -->
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Proposal content</p>
              <button
                class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1.5 transition-colors"
                @click="showEarnestDraft = true"
              >
                <Icon name="lucide:sparkles" class="w-3 h-3" />
                Draft with Earnest
                <AiSpendMark muted />
              </button>
            </div>
            <DocumentsBlockComposer
              :model-value="blocks"
              applies-to="proposals"
              :saving="savingBlocks"
              @update:model-value="onBlocksChange"
            />

            <div
              v-if="proposal.notes && (!blocks || blocks.length === 0)"
              class="ios-card p-5 mt-2"
            >
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Notes (legacy)</p>
              <div class="prose prose-sm dark:prose-invert max-w-none" v-html="proposal.notes" />
              <p class="text-xs text-muted-foreground mt-3">
                This proposal was created before the blocks composer. Add blocks above to migrate to the new format —
                your notes stay until you remove them.
              </p>
            </div>
          </div>
        </div>

        <!-- Live preview pane (large screens only) -->
        <div v-if="!compact" class="hidden xl:block">
          <div class="sticky top-4 space-y-2">
            <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Live preview</p>
            <div class="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-border/60 bg-muted/10">
              <DocumentsDocumentShell
                :seller="proposal.organization"
                wrapper-class="px-6 pt-10 pb-12 w-full proposal proposal-doc-preview"
              >
                <DocumentsDocumentHeader :seller="seller" :recipient="recipient" :doc="docMeta" />
                <div v-if="proposal.total_value != null" class="mt-6 mb-2 flex items-center justify-between pt-4" style="border-top: 1px solid var(--doc-rule);">
                  <p class="text-[10px] uppercase tracking-wider opacity-60">Total investment</p>
                  <p class="text-xl font-bold">{{ formatTotal(proposal.total_value) }}</p>
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

      <ProposalsFormModal
        v-model="showEditModal"
        :proposal="proposal"
        @updated="onProposalUpdated"
        @deleted="onProposalDeleted"
      />
    </template>

    <!-- Draft with Earnest — full-screen Generative Canvas overlay. Seeds from
         the current blocks and applies edited blocks back into the composer. -->
    <Teleport to="body">
      <div v-if="showEarnestDraft" class="pw-earnest-overlay">
        <DocumentsDocumentGenerativeCanvas
          embedded
          :initial-blocks="blocks"
          :brief="proposal?.title ? `Proposal: ${proposal.title}` : undefined"
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
