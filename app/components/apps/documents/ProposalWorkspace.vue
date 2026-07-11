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
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin t-text-muted" />
    </div>

    <template v-else-if="proposal">
      <NuxtLink
        v-if="!compact"
        to="/apps/money?floor=documents"
        class="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mt-4 mb-2"
      >
        <UIcon name="lucide:chevron-left" class="w-3 h-3" />
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
              <UIcon name="lucide:eye" class="w-3.5 h-3.5 inline -mt-0.5" />
              <span class="ml-1 hidden sm:inline">View</span>
            </button>
            <button
              class="h-6 px-2.5 rounded-md transition-colors"
              :class="mode === 'edit' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="mode = 'edit'"
            >
              <UIcon name="lucide:pencil" class="w-3.5 h-3.5 inline -mt-0.5" />
              <span class="ml-1 hidden sm:inline">Edit</span>
            </button>
            <button
              class="h-6 px-2.5 rounded-md transition-colors"
              :class="mode === 'activity' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="mode = 'activity'"
            >
              <UIcon name="lucide:history" class="w-3.5 h-3.5 inline -mt-0.5" />
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
            <UIcon
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
            <UIcon name="lucide:settings-2" class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Details</span>
          </button>
        </div>
      </div>

      <!-- AI Notices -->
      <ClientOnly>
        <AIProactiveNotices v-if="proposal?.id" entity-type="proposal" :entity-id="String(proposal.id)" />
      </ClientOnly>

      <!-- Inline-editable details -->
      <div class="ios-card p-5 mb-5">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Details</p>
        <AppsInlineDetailsEditor
          collection="proposals"
          :item-id="String(proposal.id)"
          :model-value="detailValues"
          :fields="detailFields"
          @updated="onDetailsUpdated"
        />
      </div>

      <!-- Save bar (sticky) when editing blocks -->
      <div
        v-if="mode === 'edit' && blocksDirty"
        class="sticky top-2 z-30 mb-4 flex items-center justify-between gap-2 ios-card p-2.5 bg-warning/10 dark:bg-warning/30 border-warning/40"
      >
        <p class="text-xs text-warning">Unsaved changes to proposal blocks.</p>
        <button
          class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="savingBlocks"
          @click="saveBlocks"
        >
          <UIcon
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

      <!-- EDIT mode: composer + sidebar details -->
      <div v-else class="grid grid-cols-1 gap-6" :class="{ 'lg:grid-cols-3': !compact }">
        <div class="space-y-4" :class="{ 'lg:col-span-1': !compact }">
          <div class="ios-card p-5 space-y-3">
            <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Details</p>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Value</p>
                <p class="font-medium t-text">{{ proposal.total_value ? `$${Number(proposal.total_value).toLocaleString()}` : '—' }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Expires</p>
                <p class="font-medium t-text">{{ proposal.valid_until ? new Date(proposal.valid_until).toLocaleDateString() : '—' }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Sent</p>
                <p class="font-medium t-text">{{ proposal.date_sent ? new Date(proposal.date_sent).toLocaleDateString() : '—' }}</p>
              </div>
              <div class="space-y-1">
                <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Created</p>
                <p class="font-medium t-text">{{ proposal.date_created ? new Date(proposal.date_created).toLocaleDateString() : '—' }}</p>
              </div>
            </div>
          </div>

          <div v-if="proposal.contact" class="ios-card p-5 space-y-2">
            <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Contact</p>
            <p class="text-sm font-medium t-text">{{ proposal.contact.first_name }} {{ proposal.contact.last_name }}</p>
            <p v-if="proposal.contact.email" class="text-xs t-text-secondary">{{ proposal.contact.email }}</p>
            <p v-if="proposal.contact.phone" class="text-xs t-text-secondary">{{ proposal.contact.phone }}</p>
          </div>

          <div v-if="proposal.lead" class="ios-card p-5">
            <p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Linked Lead</p>
            <button type="button" @click="slideOverStack.push('lead', proposal.lead.id)" class="text-sm text-primary hover:underline">
              View lead &rarr;
            </button>
          </div>

          <div v-if="proposal.file" class="ios-card p-5 flex items-center gap-3">
            <UIcon name="i-heroicons-paper-clip" class="w-5 h-5 t-text-muted shrink-0" />
            <div class="min-w-0">
              <p class="text-sm font-medium t-text truncate">{{ proposal.file.title || 'Attachment' }}</p>
              <p class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ proposal.file.type }}</p>
            </div>
          </div>
        </div>

        <div class="space-y-4" :class="{ 'lg:col-span-2': !compact }">
          <p class="text-[10px] uppercase tracking-wider text-muted-foreground">Proposal Content</p>
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

      <ProposalsFormModal
        v-model="showEditModal"
        :proposal="proposal"
        @updated="onProposalUpdated"
        @deleted="onProposalDeleted"
      />
    </template>

  </div>
</template>
