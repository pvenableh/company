<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" @click.self="$emit('close')">
    <div class="ios-card w-full max-w-lg mx-4 shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-4 border-b border-border/30 shrink-0">
        <h3 class="text-sm font-semibold">Send Newsletter</h3>
        <button class="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted ios-press transition-colors" @click="$emit('close')">
          <Icon name="lucide:x" class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="px-5 py-4 space-y-5 overflow-y-auto">
        <!-- Mailing Lists -->
        <div class="space-y-2">
          <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Mailing Lists</label>
          <div v-if="listsLoading" class="text-[11px] text-muted-foreground">Loading lists…</div>
          <div v-else-if="!lists.length" class="text-[11px] text-muted-foreground">No mailing lists yet.</div>
          <div v-else class="space-y-1.5 max-h-40 overflow-y-auto">
            <label
              v-for="list in lists"
              :key="list.id"
              class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors"
            >
              <input
                v-model="selectedListIds"
                type="checkbox"
                :value="list.id"
                class="rounded border-border h-3.5 w-3.5 cursor-pointer"
              />
              <span class="text-[12px] text-foreground flex-1 truncate">{{ list.name }}</span>
              <span class="text-[10px] text-muted-foreground tabular-nums">{{ list.subscriber_count || 0 }}</span>
            </label>
          </div>
        </div>

        <!-- CRM Segments -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">CRM Segments</label>
            <div class="relative" ref="segmentMenuRef">
              <button
                class="rounded-full px-2.5 py-1 text-[10px] font-medium text-primary border border-border hover:bg-primary/5 ios-press inline-flex items-center gap-1 transition-colors"
                @click="showSegmentMenu = !showSegmentMenu"
              >
                <Icon name="lucide:plus" class="w-3 h-3" /> Add segment
              </button>
              <Transition name="fade">
                <div
                  v-if="showSegmentMenu"
                  class="absolute right-0 top-full mt-1.5 w-56 ios-card py-1 shadow-xl z-50"
                >
                  <button
                    v-for="opt in segmentOptions"
                    :key="opt.type + (opt.requiresValue ? '-picker' : '')"
                    class="flex items-center gap-2 w-full px-3 py-2 text-[11px] text-left hover:bg-muted/50 transition-colors"
                    @click="addSegment(opt)"
                  >
                    <Icon :name="opt.icon" class="w-3 h-3 text-muted-foreground" />
                    <span>{{ opt.label }}</span>
                  </button>
                </div>
              </Transition>
            </div>
          </div>

          <div v-if="!segments.length" class="text-[11px] text-muted-foreground">No segments added.</div>
          <div v-else class="space-y-1.5">
            <div
              v-for="(seg, i) in segments"
              :key="i"
              class="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/40"
            >
              <Icon :name="segmentIcon(seg)" class="w-3 h-3 text-primary shrink-0" />
              <span class="text-[11px] text-foreground flex-1">{{ segmentLabel(seg) }}</span>
              <select
                v-if="seg.type === 'lead_stage'"
                v-model="seg.stage"
                class="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] focus:ring-1 focus:ring-primary/30 outline-none"
              >
                <option v-for="s in leadStages" :key="s" :value="s">{{ s.replace('_', ' ') }}</option>
              </select>
              <select
                v-if="seg.type === 'contact_category'"
                v-model="seg.category"
                class="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] focus:ring-1 focus:ring-primary/30 outline-none"
              >
                <option v-for="c in contactCategories" :key="c" :value="c">{{ c }}</option>
              </select>
              <button
                class="p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 ios-press transition-colors"
                @click="segments.splice(i, 1); previewResult = null"
              >
                <Icon name="lucide:x" class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <!-- Preview -->
        <div class="flex items-center gap-2">
          <button
            class="rounded-full px-3 py-1.5 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1.5 transition-colors disabled:opacity-40"
            :disabled="!hasTargets || previewing"
            @click="runPreview"
          >
            <Icon name="lucide:users" class="w-3 h-3" />
            {{ previewing ? 'Counting…' : 'Preview recipients' }}
          </button>
          <span v-if="previewResult" class="text-[11px] text-muted-foreground">
            <span class="font-semibold text-foreground">{{ previewResult.total }}</span>
            eligible recipient{{ previewResult.total === 1 ? '' : 's' }}
            <span v-if="previewResult.sample_emails?.length" class="t-text-muted">
              · e.g. {{ previewResult.sample_emails.slice(0, 2).join(', ') }}{{ previewResult.sample_emails.length > 2 ? '…' : '' }}
            </span>
          </span>
        </div>

        <!-- Result -->
        <div
          v-if="sendResult"
          class="rounded-xl px-3 py-2 text-xs"
          :class="sendResult.success ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'"
        >
          <p v-if="sendResult.success">
            Sent to {{ sendResult.sent }} of {{ sendResult.total }} recipient{{ sendResult.total === 1 ? '' : 's' }}.
          </p>
          <p v-else>
            {{ sendResult.error || 'Send failed' }}
          </p>
          <ul v-if="sendResult.errors?.length" class="mt-1 space-y-0.5 list-disc pl-4">
            <li v-for="(err, i) in sendResult.errors.slice(0, 3)" :key="i" class="text-[10px]">{{ err }}</li>
          </ul>
        </div>
      </div>

      <div class="flex items-center justify-between gap-2 px-5 py-3 border-t border-border/30 shrink-0">
        <p v-if="!hasTargets" class="text-[10px] text-muted-foreground">Pick a list or add a segment to enable send.</p>
        <p v-else-if="!previewResult?.total && previewResult" class="text-[10px] text-amber-600 dark:text-amber-400">
          No eligible recipients — check segment filters.
        </p>
        <div v-else />
        <div class="flex items-center gap-2">
          <button
            class="rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted ios-press transition-colors"
            @click="$emit('close')"
          >
            Cancel
          </button>
          <button
            class="rounded-full px-4 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors disabled:opacity-40 inline-flex items-center gap-1"
            :disabled="!hasTargets || sending || previewResult?.total === 0"
            @click="send"
          >
            <Icon name="lucide:send" class="w-3 h-3" />
            {{ sending ? 'Sending…' : 'Send Newsletter' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside } from '@vueuse/core';

const props = defineProps<{
  templateId: number;
  templateName?: string;
}>();
defineEmits<{ close: [] }>();

type Segment =
  | { type: 'lead_stage'; stage: string }
  | { type: 'lead_any_open' }
  | { type: 'client_active' }
  | { type: 'contact_category'; category: string };

const { getLists } = useMailingLists();
const { selectedOrg } = useOrganization();

const lists = ref<any[]>([]);
const listsLoading = ref(true);
const selectedListIds = ref<number[]>([]);

const segments = ref<Segment[]>([]);
const showSegmentMenu = ref(false);
const segmentMenuRef = ref<HTMLElement | null>(null);
onClickOutside(segmentMenuRef, () => { showSegmentMenu.value = false; });

const leadStages = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiating'];
const contactCategories = ['client', 'prospect', 'architect', 'developer', 'hospitality', 'partner', 'media'];

const segmentOptions = [
  { type: 'lead_stage', label: 'Leads at stage…', icon: 'lucide:target', requiresValue: true },
  { type: 'lead_any_open', label: 'Any open lead', icon: 'lucide:inbox', requiresValue: false },
  { type: 'client_active', label: 'Active clients', icon: 'lucide:briefcase', requiresValue: false },
  { type: 'contact_category', label: 'Contacts by category…', icon: 'lucide:tag', requiresValue: true },
] as const;

function addSegment(opt: typeof segmentOptions[number]) {
  showSegmentMenu.value = false;
  previewResult.value = null;
  if (opt.type === 'lead_stage') segments.value.push({ type: 'lead_stage', stage: 'negotiating' });
  else if (opt.type === 'lead_any_open') segments.value.push({ type: 'lead_any_open' });
  else if (opt.type === 'client_active') segments.value.push({ type: 'client_active' });
  else if (opt.type === 'contact_category') segments.value.push({ type: 'contact_category', category: 'prospect' });
}

function segmentIcon(seg: Segment) {
  return segmentOptions.find((o) => o.type === seg.type)?.icon || 'lucide:filter';
}

function segmentLabel(seg: Segment) {
  if (seg.type === 'lead_stage') return 'Leads at stage:';
  if (seg.type === 'lead_any_open') return 'Any open lead';
  if (seg.type === 'client_active') return 'Active clients';
  if (seg.type === 'contact_category') return 'Contacts category:';
  return '';
}

const hasTargets = computed(() => selectedListIds.value.length > 0 || segments.value.length > 0);

const previewing = ref(false);
const previewResult = ref<{ total: number; sample_emails?: string[] } | null>(null);

const sending = ref(false);
const sendResult = ref<any | null>(null);

// Reset preview when targets change
watch([selectedListIds, segments], () => { previewResult.value = null; }, { deep: true });

function buildBody() {
  return {
    template_id: props.templateId,
    name: props.templateName,
    target_lists: selectedListIds.value.length ? selectedListIds.value : undefined,
    target_segments: segments.value.length ? JSON.parse(JSON.stringify(segments.value)) : undefined,
    organization_id: selectedOrg.value || undefined,
  };
}

async function runPreview() {
  previewing.value = true;
  sendResult.value = null;
  try {
    const res = await $fetch<any>('/api/email/newsletter-send?dry_run=1', {
      method: 'POST',
      body: buildBody(),
    });
    previewResult.value = { total: res.total || 0, sample_emails: res.sample_emails || [] };
  } catch (err: any) {
    previewResult.value = { total: 0 };
    sendResult.value = { success: false, error: err?.data?.message || err?.message || 'Preview failed' };
  } finally {
    previewing.value = false;
  }
}

async function send() {
  sending.value = true;
  sendResult.value = null;
  try {
    sendResult.value = await $fetch<any>('/api/email/newsletter-send', {
      method: 'POST',
      body: buildBody(),
    });
  } catch (err: any) {
    sendResult.value = { success: false, error: err?.data?.message || err?.message || 'Send failed' };
  } finally {
    sending.value = false;
  }
}

onMounted(async () => {
  try {
    lists.value = await getLists();
  } catch {
    lists.value = [];
  } finally {
    listsLoading.value = false;
  }
});
</script>
