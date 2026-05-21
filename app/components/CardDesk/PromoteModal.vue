<template>
  <!-- not a sheet because: multi-step wizard (preview → choice → create/link → confirm), see [[feedback_ios_native_strategy]] -->
  <UModal
    v-model="isOpen"
    title="Promote to Earnest CRM"
    :ui="{ content: 'max-w-md' }"
  >
    <div class="space-y-4 mt-1">
      <!-- Loading preview -->
      <div v-if="loadingPreview" class="py-8 text-center text-xs text-muted-foreground">
        <Icon name="lucide:loader-2" class="w-4 h-4 animate-spin inline-block mr-1" />
        Checking for matches…
      </div>

      <!-- Already promoted state -->
      <template v-else-if="preview?.already_promoted">
        <div class="rounded-lg border border-success/30 bg-success/5 p-3">
          <div class="flex items-start gap-2">
            <Icon name="lucide:check-circle" class="w-4 h-4 text-success mt-0.5 shrink-0" />
            <div class="text-xs">
              <div class="font-medium text-foreground">Already in Earnest</div>
              <div class="text-muted-foreground mt-0.5">
                Linked to
                <span class="font-medium text-foreground">{{ preview.promoted_contact?.first_name }} {{ preview.promoted_contact?.last_name }}</span>
                <span v-if="preview.promoted_contact?.company"> · {{ preview.promoted_contact.company }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="sm" @click="close">Close</Button>
          <Button variant="default" size="sm" @click="openPromotedContactPanel">
            View contact <Icon name="lucide:arrow-right" class="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </template>

      <!-- Choice state: create vs link -->
      <template v-else-if="preview">
        <!-- cd_contact summary -->
        <div class="rounded-lg border border-border bg-muted/30 p-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xs font-bold">
              {{ initials(preview.cd_contact.display_name) }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium truncate">{{ preview.cd_contact.display_name }}</div>
              <div class="text-[11px] text-muted-foreground truncate">
                <span v-if="preview.cd_contact.email">{{ preview.cd_contact.email }}</span>
                <span v-if="preview.cd_contact.email && preview.cd_contact.company"> · </span>
                <span v-if="preview.cd_contact.company">{{ preview.cd_contact.company }}</span>
              </div>
            </div>
            <span
              v-if="preview.cd_contact.rating"
              class="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize shrink-0"
              :class="ratingClass(preview.cd_contact.rating)"
            >
              {{ preview.cd_contact.rating }}
            </span>
          </div>
        </div>

        <!-- Match prompt or create-new -->
        <div v-if="preview.match" class="space-y-2">
          <div class="text-[11px] uppercase font-semibold text-muted-foreground tracking-wider">
            We found a match
          </div>
          <button
            type="button"
            class="w-full flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-colors"
            :class="action === 'link' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'"
            @click="action = 'link'"
          >
            <Icon name="lucide:link" class="w-4 h-4 text-primary shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium truncate">
                Link to {{ preview.match.first_name }} {{ preview.match.last_name }}
              </div>
              <div class="text-[11px] text-muted-foreground truncate">
                Already in your Earnest CRM<span v-if="preview.match.company"> · {{ preview.match.company }}</span>
              </div>
            </div>
            <Icon
              v-if="action === 'link'"
              name="lucide:check-circle"
              class="w-4 h-4 text-primary shrink-0"
            />
          </button>
          <button
            type="button"
            class="w-full flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-colors"
            :class="action === 'create' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'"
            @click="action = 'create'"
          >
            <Icon name="lucide:user-plus" class="w-4 h-4 text-muted-foreground shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium">Create new instead</div>
              <div class="text-[11px] text-muted-foreground">
                Different person despite the same email
              </div>
            </div>
            <Icon
              v-if="action === 'create'"
              name="lucide:check-circle"
              class="w-4 h-4 text-primary shrink-0"
            />
          </button>
        </div>
        <div v-else class="rounded-lg border border-border p-3 text-xs">
          <div class="flex items-start gap-2">
            <Icon name="lucide:user-plus" class="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <div class="font-medium">A new contact will be created</div>
              <div class="text-muted-foreground mt-0.5">
                No existing match for <span class="font-mono">{{ preview.cd_contact.email || '(no email)' }}</span> in this org.
              </div>
            </div>
          </div>
        </div>

        <!-- Lead toggle -->
        <div
          v-if="leadStage"
          class="flex items-start gap-2 rounded-lg border border-border p-3"
        >
          <input
            id="cd-promote-open-lead"
            v-model="openLead"
            type="checkbox"
            class="mt-0.5 rounded border-border"
          />
          <label for="cd-promote-open-lead" class="text-xs flex-1 cursor-pointer">
            <span class="font-medium">Also open a Lead</span>
            <span class="text-muted-foreground">
              ({{ leadStage }} stage based on
              <span class="capitalize">{{ preview.cd_contact.rating }}</span> rating)
            </span>
          </label>
        </div>
        <div v-else-if="preview.cd_contact.rating === 'cold'" class="text-[11px] text-muted-foreground italic">
          Cold contacts don't open a Lead — only the rolodex entry.
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" :disabled="submitting" @click="close">Cancel</Button>
          <Button :disabled="submitting" size="sm" @click="confirm">
            <Icon v-if="submitting" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1 animate-spin" />
            {{ submitButtonLabel }}
          </Button>
        </div>
      </template>

      <!-- Error -->
      <div v-else-if="error" class="text-xs text-destructive">
        {{ error }}
      </div>
    </div>
  </UModal>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';

interface CdSummary {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  rating: string | null;
}

interface MatchedContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
}

interface PreviewResult {
  cd_contact: CdSummary;
  already_promoted: boolean;
  promoted_contact: MatchedContact | null;
  match: MatchedContact | null;
}

interface PromoteResult {
  contact: { id: string; first_name: string; last_name: string; email: string | null; company: string | null };
  lead: { id: string; name: string; stage: string } | null;
  alreadyExisted: boolean;
  xpEarned: number;
  isStub?: boolean;
}

const props = defineProps<{
  modelValue: boolean;
  cdContactId: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  promoted: [result: PromoteResult];
}>();

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const { selectedOrg } = useOrganization() as any;
const toast = useToast();
const contactSlide = useAppSlideOver('contact');

function openPromotedContactPanel() {
  const id = preview.value?.promoted_contact?.id;
  if (!id) return;
  close();
  // Defer so the modal close animation doesn't fight the slide-over push.
  nextTick(() => contactSlide.open(String(id)));
}

const loadingPreview = ref(false);
const preview = ref<PreviewResult | null>(null);
const error = ref<string | null>(null);

const action = ref<'create' | 'link'>('create');
const openLead = ref(true);
const submitting = ref(false);

const STAGE_FROM_RATING: Record<string, string> = {
  hot: 'qualified',
  warm: 'contacted',
  nurture: 'new',
};

const leadStage = computed(() => {
  const r = preview.value?.cd_contact.rating;
  return r ? STAGE_FROM_RATING[r] || null : null;
});

const submitButtonLabel = computed(() => {
  if (action.value === 'link') return 'Link & Promote';
  return openLead.value && leadStage.value ? 'Create + Open Lead' : 'Create Contact';
});

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

function ratingClass(r: string) {
  if (r === 'hot') return 'bg-destructive/10 text-destructive';
  if (r === 'warm') return 'bg-warning/10 text-warning';
  if (r === 'nurture') return 'bg-success/10 text-success';
  if (r === 'cold') return 'bg-blue-100 text-blue-700';
  return 'bg-muted text-muted-foreground';
}

function close() {
  isOpen.value = false;
}

async function loadPreview() {
  if (!props.cdContactId) {
    error.value = 'No contact selected';
    return;
  }
  if (!selectedOrg.value) {
    error.value = 'No organization selected — pick one from the org switcher first.';
    return;
  }
  loadingPreview.value = true;
  preview.value = null;
  error.value = null;
  try {
    const res = await $fetch<PreviewResult>(
      `/api/carddesk/${props.cdContactId}/promote-preview`,
      { query: { org_id: selectedOrg.value } },
    );
    preview.value = res;
    action.value = res.match ? 'link' : 'create';
    openLead.value = !!(res.cd_contact.rating && STAGE_FROM_RATING[res.cd_contact.rating]);
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Failed to load preview';
  } finally {
    loadingPreview.value = false;
  }
}

async function confirm() {
  if (!props.cdContactId || !selectedOrg.value || !preview.value) return;
  submitting.value = true;
  try {
    const res = await $fetch<PromoteResult>(
      `/api/carddesk/${props.cdContactId}/promote`,
      {
        method: 'POST',
        body: {
          action: action.value,
          existing_contact_id: action.value === 'link' ? preview.value.match?.id : undefined,
          open_lead: openLead.value,
          org_id: selectedOrg.value,
        },
      },
    );
    const xpSuffix = res.xpEarned ? ` · +${res.xpEarned} XP` : '';
    toast.add({
      title: res.alreadyExisted ? 'Linked to existing contact' : 'Added to Earnest',
      description: res.lead
        ? `Lead opened in ${res.lead.stage} stage${xpSuffix}`
        : `In rolodex${xpSuffix}`,
      color: 'green',
    });
    emit('promoted', res);
    close();
  } catch (err: any) {
    toast.add({
      title: 'Promote failed',
      description: err?.data?.message || err?.message,
      color: 'red',
    });
  } finally {
    submitting.value = false;
  }
}

// `immediate: true` matters because the parent uses `v-if` to mount us only
// when the modal opens — by the time we mount, `isOpen` is already true and
// a lazy watch never fires. Without immediate, the body renders empty.
watch(isOpen, (open) => {
  if (open) loadPreview();
}, { immediate: true });
</script>
