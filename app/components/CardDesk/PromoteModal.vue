<template>
  <!-- not a sheet because: multi-step wizard (preview → choice → create/link → confirm), see [[feedback_ios_native_strategy]] -->
  <EModal
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
            <div class="text-xs flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-foreground">Already in Earnest</span>
                <span
                  v-if="graduationLabel"
                  class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                  :class="graduationLabel === 'Partner' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'"
                >
                  <Icon :name="graduationLabel === 'Partner' ? 'lucide:handshake' : 'lucide:briefcase'" class="w-3 h-3" />
                  {{ graduationLabel }}
                </span>
              </div>
              <div class="text-muted-foreground mt-0.5">
                Linked to
                <span class="font-medium text-foreground">{{ preview.promoted_contact?.first_name }} {{ preview.promoted_contact?.last_name }}</span>
                <span v-if="preview.promoted_contact?.company"> · {{ preview.promoted_contact.company }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Convert-to-client/partner — only when not already graduated. The
             promote endpoint upgrades the existing linked contact in place. -->
        <div v-if="!alreadyGraduated" class="rounded-lg border border-border p-3 space-y-2">
          <div class="flex items-center gap-2 text-xs">
            <Icon name="lucide:trending-up" class="w-4 h-4 text-primary shrink-0" />
            <span class="font-medium">Convert this contact further</span>
          </div>
          <p class="text-[11px] text-muted-foreground">
            Spin up a CRM {{ goal === 'partner' ? 'partner' : 'client' }} account anchored to this contact.
          </p>
          <div class="inline-flex rounded-lg border border-border p-0.5 text-[11px]">
            <button
              type="button"
              class="px-2.5 py-1 rounded-md font-medium transition-colors"
              :class="goal === 'client' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="goal = 'client'"
            >
              Client
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-md font-medium transition-colors"
              :class="goal === 'partner' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
              @click="goal = 'partner'"
            >
              Partner
            </button>
          </div>
          <input
            v-model="conversionReason"
            type="text"
            placeholder="What sealed it? (e.g. Project, Retainer, Referral)"
            class="w-full text-xs rounded-lg glass-field px-2.5 py-1.5"
          />
          <input
            v-model.number="estimatedValue"
            type="number"
            min="0"
            placeholder="Estimated value (USD, optional)"
            class="w-full text-xs rounded-lg glass-field px-2.5 py-1.5"
          />
        </div>

        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="sm" :disabled="submitting" @click="close">Close</Button>
          <Button v-if="!alreadyGraduated" variant="outline" size="sm" :disabled="submitting" @click="confirmGraduation">
            <Icon v-if="submitting" name="lucide:loader-2" class="w-3.5 h-3.5 mr-1 animate-spin" />
            Convert to {{ goal === 'partner' ? 'Partner' : 'Client' }}
          </Button>
          <Button variant="default" size="sm" :disabled="submitting" @click="openPromotedContactPanel">
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

        <!-- Client / Partner graduation -->
        <div class="rounded-lg border border-border p-3 space-y-2">
          <label class="flex items-start gap-2 cursor-pointer">
            <input
              v-model="convertToClient"
              type="checkbox"
              class="mt-0.5 rounded border-border"
            />
            <span class="text-xs flex-1">
              <span class="font-medium">Convert to a {{ goal === 'partner' ? 'Partner' : 'Client' }}</span>
              <span class="text-muted-foreground">
                — also creates a CRM {{ goal === 'partner' ? 'partner' : 'client' }} account anchored to this contact.
              </span>
            </span>
          </label>
          <div v-if="convertToClient" class="pl-6 space-y-2">
            <div class="inline-flex rounded-lg border border-border p-0.5 text-[11px]">
              <button
                type="button"
                class="px-2.5 py-1 rounded-md font-medium transition-colors"
                :class="goal === 'client' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
                @click="goal = 'client'"
              >
                Client
              </button>
              <button
                type="button"
                class="px-2.5 py-1 rounded-md font-medium transition-colors"
                :class="goal === 'partner' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
                @click="goal = 'partner'"
              >
                Partner
              </button>
            </div>
            <input
              v-model="conversionReason"
              type="text"
              placeholder="What sealed it? (e.g. Project, Retainer, Referral)"
              class="w-full text-xs rounded-lg glass-field px-2.5 py-1.5"
            />
            <input
              v-model.number="estimatedValue"
              type="number"
              min="0"
              placeholder="Estimated value (USD, optional)"
              class="w-full text-xs rounded-lg glass-field px-2.5 py-1.5"
            />
          </div>
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
  </EModal>
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

interface GraduationState {
  is_client: boolean;
  is_partner: boolean;
  earnest_client_id: string | null;
}

interface PreviewResult {
  cd_contact: CdSummary;
  already_promoted: boolean;
  promoted_contact: MatchedContact | null;
  match: MatchedContact | null;
  graduation?: GraduationState;
}

interface PromoteResult {
  contact: { id: string; first_name: string; last_name: string; email: string | null; company: string | null };
  lead: { id: string; name: string; stage: string } | null;
  client: { id: string; name: string; goal: 'client' | 'partner' } | null;
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
const convertToClient = ref(false);
const goal = ref<'client' | 'partner'>('client');
const conversionReason = ref('');
const estimatedValue = ref<number | null>(null);

const STAGE_FROM_RATING: Record<string, string> = {
  hot: 'qualified',
  warm: 'contacted',
  nurture: 'new',
};

const leadStage = computed(() => {
  const r = preview.value?.cd_contact.rating;
  return r ? STAGE_FROM_RATING[r] || null : null;
});

// Graduation state for the already-promoted branch. `alreadyGraduated` is true
// once the card has spun up an Earnest client/partner account; until then we
// offer the convert control so a contact can be upgraded after the fact.
const alreadyGraduated = computed(() => {
  const g = preview.value?.graduation;
  return !!(g && (g.earnest_client_id || g.is_client || g.is_partner));
});
const graduationLabel = computed(() => {
  const g = preview.value?.graduation;
  if (!g) return null;
  if (g.is_partner) return 'Partner';
  if (g.is_client || g.earnest_client_id) return 'Client';
  return null;
});

// Convert an ALREADY-promoted card to a client/partner. Reuses the linked
// contact (the promote endpoint detects cd.promoted_contact) and skips lead
// creation so we don't open a duplicate lead.
async function confirmGraduation() {
  convertToClient.value = true;
  openLead.value = false;
  await confirm();
}

const submitButtonLabel = computed(() => {
  if (convertToClient.value) return goal.value === 'partner' ? 'Convert to Partner' : 'Convert to Client';
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
          goal: convertToClient.value ? goal.value : 'contact',
          conversion_reason: convertToClient.value ? conversionReason.value || undefined : undefined,
          estimated_value: convertToClient.value ? estimatedValue.value : undefined,
        },
      },
    );
    const xpSuffix = res.xpEarned ? ` · +${res.xpEarned} XP` : '';
    toast.add({
      title: res.client
        ? `Converted to ${res.client.goal === 'partner' ? 'Partner' : 'Client'}`
        : res.alreadyExisted
          ? 'Linked to existing contact'
          : 'Added to Earnest',
      description: res.client
        ? `Created client "${res.client.name}"${xpSuffix}`
        : res.lead
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
