<!--
  DraftWithAiSheet — "Draft with AI" entry point.

  The user types a plain-language overview of the project deliverables and
  Earnest generates a DRAFT proposal and/or contract (POST /api/ai/generate-
  documents), then opens the result in the editor for review. Nothing is sent
  or signed — these are fully-editable drafts. The endpoint's prompt only uses
  facts the user provides (voice-charter honesty floor).

  Auto-imported bare as <DraftWithAiSheet> (pathPrefix is off). AppBottomSheet
  is likewise bare; the shadcn ui/* primitives (Button, Textarea) need explicit
  imports.
-->
<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** Optional links to ground + attach the generated documents. */
    leadId?: number | string | null;
    clientId?: string | null;
    contactId?: string | null;
  }>(),
  { leadId: null, clientId: null, contactId: null },
);

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'created', payload: { proposalId: string | null; contractId: string | number | null; title: string }): void;
}>();

const toast = useToast();
const route = useRoute();
const { selectedOrg } = useOrganization();
const proposalSlide = useAppSlideOver('proposal');
const contractSlide = useAppSlideOver('contract');

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const overview = ref('');
const wantProposal = ref(true);
const wantContract = ref(true);
const loading = ref(false);

const canSubmit = computed(
  () => overview.value.trim().length >= 12 && (wantProposal.value || wantContract.value) && !loading.value,
);

// Reset each time the sheet opens.
watch(open, (isOpen) => {
  if (isOpen) {
    overview.value = '';
    wantProposal.value = true;
    wantContract.value = true;
    loading.value = false;
  }
});

async function openDraft(proposalId: string | null, contractId: string | number | null) {
  const inApps = route.path.startsWith('/apps/');
  // Prefer the proposal (the contract is linked to it); fall back to the contract.
  if (proposalId) {
    if (inApps) proposalSlide.open(String(proposalId), 'edit');
    else await navigateTo(`/proposals/${proposalId}?edit=1`);
  } else if (contractId != null) {
    if (inApps) contractSlide.open(String(contractId), 'edit');
    else await navigateTo(`/contracts/${contractId}?edit=1`);
  }
}

async function generate() {
  if (!canSubmit.value) return;
  if (!selectedOrg.value) {
    toast.error('No organization selected');
    return;
  }

  const targets: Array<'proposal' | 'contract'> = [];
  if (wantProposal.value) targets.push('proposal');
  if (wantContract.value) targets.push('contract');

  loading.value = true;
  try {
    const res = await $fetch<{
      created: boolean;
      title: string;
      proposalId: string | null;
      contractId: string | number | null;
    }>('/api/ai/generate-documents', {
      method: 'POST',
      body: {
        overview: overview.value.trim(),
        organizationId: selectedOrg.value,
        targets,
        leadId: props.leadId ?? null,
        clientId: props.clientId ?? null,
        contactId: props.contactId ?? null,
      },
    });

    const made = [res.proposalId && 'Proposal', res.contractId != null && 'Contract'].filter(Boolean).join(' + ');
    if (!res.proposalId && res.contractId == null) {
      toast.warning('No document content was generated — try adding more detail to the overview.');
      return;
    }
    toast.success(`${made} drafted — opening for review`);
    emit('created', { proposalId: res.proposalId, contractId: res.contractId, title: res.title });
    open.value = false;
    await openDraft(res.proposalId, res.contractId);
  } catch (err: any) {
    toast.error(err?.data?.message || err?.message || 'Draft generation failed');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AppBottomSheet
    v-model="open"
    title="Draft with AI"
    subtitle="Describe the deliverables — Earnest drafts editable documents. Nothing is sent."
  >
    <div class="space-y-4">
      <div>
        <label class="text-sm font-medium mb-1.5 block">Project deliverables overview</label>
        <Textarea
          v-model="overview"
          :rows="6"
          class="min-h-32"
          placeholder="e.g. Brand identity for Atlas Fintech: logo suite, color system, typography, and a one-page brand guideline. Two rounds of revisions, 4-week timeline, $8,000."
        />
        <p class="text-xs text-muted-foreground mt-1.5">
          Earnest only uses facts you provide — it won't invent prices, dates, or terms. Anything missing
          becomes a bracketed placeholder for you to fill in.
        </p>
      </div>

      <div>
        <label class="text-sm font-medium mb-1.5 block">Generate</label>
        <div class="flex gap-2">
          <Button
            type="button"
            size="sm"
            :variant="wantProposal ? 'default' : 'outline'"
            @click="wantProposal = !wantProposal"
          >
            <Icon name="lucide:file-text" class="w-4 h-4 mr-1" />
            Proposal
          </Button>
          <Button
            type="button"
            size="sm"
            :variant="wantContract ? 'default' : 'outline'"
            @click="wantContract = !wantContract"
          >
            <Icon name="lucide:file-signature" class="w-4 h-4 mr-1" />
            Contract
          </Button>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <Button variant="ghost" size="sm" :disabled="loading" @click="open = false">Cancel</Button>
        <Button size="sm" :disabled="!canSubmit" @click="generate">
          <Icon v-if="loading" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
          <Icon v-else name="lucide:sparkles" class="w-4 h-4 mr-1" />
          {{ loading ? 'Drafting…' : 'Generate drafts' }}
        </Button>
      </div>
    </template>
  </AppBottomSheet>
</template>
