<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" @click.self="$emit('close')">
    <div class="ios-card w-full max-w-2xl mx-4 shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-4 border-b border-border/30 shrink-0">
        <div>
          <h3 class="text-sm font-semibold">Send Newsletter</h3>
          <p v-if="templateName" class="text-[10px] text-muted-foreground mt-0.5 truncate">{{ templateName }}</p>
        </div>
        <button class="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted ios-press transition-colors" @click="$emit('close')">
          <Icon name="lucide:x" class="w-3.5 h-3.5" />
        </button>
      </div>

      <div class="px-5 py-4 space-y-5 overflow-y-auto flex-1">
        <!-- Mailing Lists -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Mailing Lists</label>
            <button
              v-if="lists.length"
              type="button"
              class="text-[10px] text-primary hover:underline"
              @click="toggleAllLists"
            >
              {{ allListsSelected ? 'Clear all' : 'Select all' }}
            </button>
          </div>
          <div v-if="listsLoading" class="text-[11px] text-muted-foreground">Loading lists…</div>
          <div v-else-if="!lists.length" class="text-[11px] text-muted-foreground italic">
            No mailing lists yet — create one from the Marketing app.
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
            <label
              v-for="list in lists"
              :key="list.id"
              class="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border/40 hover:bg-muted/40 cursor-pointer transition-colors"
              :class="{ 'bg-primary/5 border-primary/30': selectedListIds.includes(list.id) }"
            >
              <input
                v-model="selectedListIds"
                type="checkbox"
                :value="list.id"
                class="rounded border-border h-3.5 w-3.5 cursor-pointer"
              />
              <span class="text-[12px] text-foreground flex-1 truncate">{{ list.name }}</span>
              <span class="text-[10px] text-muted-foreground tabular-nums shrink-0">{{ list.subscriber_count || 0 }}</span>
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
                class="glass-field rounded-full px-2 py-0.5 text-[10px] outline-none"
              >
                <option v-for="s in leadStages" :key="s" :value="s">{{ s.replace('_', ' ') }}</option>
              </select>
              <select
                v-if="seg.type === 'contact_category'"
                v-model="seg.category"
                class="glass-field rounded-full px-2 py-0.5 text-[10px] outline-none"
              >
                <option v-for="c in contactCategories" :key="c" :value="c">{{ c }}</option>
              </select>
              <button
                class="p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 ios-press transition-colors"
                @click="removeSegment(i)"
              >
                <Icon name="lucide:x" class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <!-- Recipients (resolved + per-contact toggle) -->
        <div v-if="hasTargets" class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Recipients
              <span v-if="resolved.length" class="ml-1 text-[10px] text-muted-foreground/80">
                ({{ excludedEmails.size }} excluded · {{ effectiveCount }} will send)
              </span>
            </label>
            <div class="flex items-center gap-2">
              <button
                v-if="resolved.length"
                type="button"
                class="text-[10px] text-primary hover:underline"
                @click="excludedEmails.clear()"
              >Include all</button>
              <button
                v-if="resolved.length"
                type="button"
                class="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                @click="excludeAll"
              >Exclude all</button>
              <button
                type="button"
                class="rounded-full px-2.5 py-1 text-[10px] font-medium border border-border bg-card hover:bg-muted ios-press inline-flex items-center gap-1 transition-colors disabled:opacity-40"
                :disabled="resolving"
                @click="resolveRecipients"
              >
                <Icon :name="resolving ? 'lucide:loader-2' : 'lucide:refresh-cw'" class="w-3 h-3" :class="{ 'animate-spin': resolving }" />
                {{ resolved.length ? 'Refresh' : 'Load recipients' }}
              </button>
            </div>
          </div>

          <div v-if="resolveError" class="rounded-lg bg-destructive/10 text-destructive px-3 py-2 text-[11px]">
            {{ resolveError }}
          </div>

          <div v-if="resolved.length" class="space-y-2">
            <div class="relative">
              <Icon name="lucide:search" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                v-model="recipientSearch"
                type="text"
                placeholder="Filter recipients…"
                class="w-full pl-7 pr-3 py-1.5 glass-field rounded-full text-[12px] outline-none"
              >
            </div>

            <div class="rounded-xl border border-border/40 max-h-60 overflow-y-auto divide-y divide-border/30">
              <label
                v-for="c in filteredResolved"
                :key="c.id || c.email"
                class="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 cursor-pointer transition-colors"
                :class="{ 'opacity-50': excludedEmails.has(c.email) }"
              >
                <input
                  type="checkbox"
                  :checked="!excludedEmails.has(c.email)"
                  class="rounded border-border h-3.5 w-3.5 cursor-pointer"
                  @change="toggleExclude(c.email, ($event.target as HTMLInputElement).checked)"
                >
                <div class="flex-1 min-w-0">
                  <p class="text-[12px] text-foreground truncate">
                    {{ c.first_name || c.last_name ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : c.email }}
                  </p>
                  <p v-if="c.first_name || c.last_name" class="text-[10px] text-muted-foreground truncate">{{ c.email }}</p>
                </div>
              </label>
              <div v-if="!filteredResolved.length" class="px-3 py-4 text-center text-[11px] text-muted-foreground">
                No recipients match "{{ recipientSearch }}".
              </div>
            </div>
          </div>
          <div v-else-if="!resolving" class="text-[11px] text-muted-foreground italic">
            Tap <span class="font-medium">Load recipients</span> to review who'll receive this send and deselect anyone you want to skip.
          </div>
        </div>

        <!-- Result -->
        <div
          v-if="sendResult"
          class="rounded-xl px-3 py-2 text-xs"
          :class="sendResult.success ? 'bg-success/10 text-success dark:text-success' : 'bg-destructive/10 text-destructive'"
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
        <p v-else-if="resolved.length === 0" class="text-[10px] text-muted-foreground">
          Lists / segments selected · load recipients to review and trim.
        </p>
        <p v-else-if="effectiveCount === 0" class="text-[10px] text-warning dark:text-warning">
          Everyone is excluded — re-include at least one recipient.
        </p>
        <p v-else class="text-[10px] text-muted-foreground">
          Sending to <span class="font-semibold text-foreground">{{ effectiveCount }}</span>
          recipient{{ effectiveCount === 1 ? '' : 's' }}.
        </p>
        <div class="flex items-center gap-2">
          <button
            class="rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted ios-press transition-colors"
            @click="$emit('close')"
          >
            Cancel
          </button>
          <button
            class="rounded-full px-4 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors disabled:opacity-40 inline-flex items-center gap-1"
            :disabled="!canSend"
            @click="send"
          >
            <Icon name="lucide:send" class="w-3 h-3" />
            {{ sending ? 'Sending…' : `Send to ${effectiveCount || ''}`.trim() }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside } from '@vueuse/core';
import type { Contact } from '~~/shared/email/contacts';

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

const { getLists, resolveRecipients: resolveListContacts } = useMailingLists();
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
  if (opt.type === 'lead_stage') segments.value.push({ type: 'lead_stage', stage: 'negotiating' });
  else if (opt.type === 'lead_any_open') segments.value.push({ type: 'lead_any_open' });
  else if (opt.type === 'client_active') segments.value.push({ type: 'client_active' });
  else if (opt.type === 'contact_category') segments.value.push({ type: 'contact_category', category: 'prospect' });
}

function removeSegment(i: number) {
  segments.value.splice(i, 1);
  resolved.value = [];
  excludedEmails.value.clear();
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
const allListsSelected = computed(() => lists.value.length > 0 && selectedListIds.value.length === lists.value.length);

function toggleAllLists() {
  if (allListsSelected.value) {
    selectedListIds.value = [];
  } else {
    selectedListIds.value = lists.value.map((l: any) => l.id);
  }
}

// ── Recipient resolution ─────────────────────────────────────────────
const resolved = ref<Contact[]>([]);
const resolving = ref(false);
const resolveError = ref<string | null>(null);
const excludedEmails = ref(new Set<string>());
const recipientSearch = ref('');

const filteredResolved = computed(() => {
  const q = recipientSearch.value.trim().toLowerCase();
  if (!q) return resolved.value;
  return resolved.value.filter((c) => {
    const hay = `${c.email || ''} ${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
    return hay.includes(q);
  });
});

const effectiveCount = computed(() => resolved.value.length - excludedEmails.value.size);

function toggleExclude(email: string, include: boolean) {
  const next = new Set(excludedEmails.value);
  if (include) next.delete(email);
  else next.add(email);
  excludedEmails.value = next;
}

function excludeAll() {
  excludedEmails.value = new Set(resolved.value.map((c) => c.email).filter(Boolean) as string[]);
}

async function resolveRecipients() {
  if (!hasTargets.value) return;
  resolving.value = true;
  resolveError.value = null;
  try {
    // Lists: use the local resolver (already org-scoped + deduped).
    const fromLists = selectedListIds.value.length
      ? await resolveListContacts(selectedListIds.value)
      : [];

    // Segments: use the server dry-run which understands CRM segment types.
    // Then read back the full contact rows so we can show name/email pairs.
    let fromSegments: Contact[] = [];
    if (segments.value.length) {
      try {
        const res = await $fetch<any>('/api/email/newsletter-send?dry_run=1', {
          method: 'POST',
          body: {
            template_id: props.templateId,
            target_segments: JSON.parse(JSON.stringify(segments.value)),
            organization_id: selectedOrg.value || undefined,
          },
        });
        const segEmails: string[] = res?.sample_emails || [];
        // Dry-run only returns a sample preview; treat that as a hint, not
        // the full list. Send time the server re-resolves from the segments,
        // so per-contact opt-outs from segments are surrendered to the
        // server unless we expand the dry-run contract. For now we show the
        // sample + count so users at least see what they're sending into.
        if (typeof res?.total === 'number' && res.total > segEmails.length) {
          resolveError.value = `Segments resolve to ${res.total} recipients; per-contact opt-out is only available for mailing-list selections (showing ${segEmails.length}-row sample).`;
        }
        fromSegments = segEmails.map((email) => ({ id: '', email, first_name: null, last_name: null } as any));
      } catch (err: any) {
        resolveError.value = err?.data?.message || err?.message || 'Could not resolve segments.';
      }
    }

    // Dedup across lists + segments.
    const seen = new Set<string>();
    const all: Contact[] = [];
    for (const c of [...fromLists, ...fromSegments]) {
      if (c.email && !seen.has(c.email)) {
        seen.add(c.email);
        all.push(c);
      }
    }
    resolved.value = all;
    excludedEmails.value = new Set();
  } catch (err: any) {
    resolveError.value = err?.data?.message || err?.message || 'Failed to resolve recipients.';
    resolved.value = [];
  } finally {
    resolving.value = false;
  }
}

// Re-resolve when targets change so the count badge stays honest.
let resolveDebounce: ReturnType<typeof setTimeout> | null = null;
watch([selectedListIds, segments], () => {
  if (resolveDebounce) clearTimeout(resolveDebounce);
  if (!hasTargets.value) {
    resolved.value = [];
    excludedEmails.value.clear();
    return;
  }
  // Only auto-refresh when we already loaded once — otherwise the user
  // would burn permissions every keystroke on the segment selectors.
  if (resolved.value.length === 0 && !resolveError.value) return;
  resolveDebounce = setTimeout(() => resolveRecipients(), 350);
}, { deep: true });

// ── Send ─────────────────────────────────────────────────────────────
const sending = ref(false);
const sendResult = ref<any | null>(null);

const canSend = computed(() => {
  if (!hasTargets.value || sending.value) return false;
  // If the user loaded recipients and excluded some, require at least one.
  if (resolved.value.length > 0 && effectiveCount.value === 0) return false;
  return true;
});

function buildBody() {
  // If recipients are loaded AND any were excluded, send by explicit
  // recipient_ids instead of target_lists so the server sees the trimmed
  // set. Falls back to list-based send when no opt-outs are applied so
  // large sends stay efficient.
  const trimmedRecipients = resolved.value
    .filter((c) => c.email && !excludedEmails.value.has(c.email))
    .map((c) => c.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  const useExplicit = resolved.value.length > 0 && excludedEmails.value.size > 0 && trimmedRecipients.length > 0;

  return {
    template_id: props.templateId,
    name: props.templateName,
    target_lists: useExplicit ? undefined : (selectedListIds.value.length ? selectedListIds.value : undefined),
    target_segments: useExplicit ? undefined : (segments.value.length ? JSON.parse(JSON.stringify(segments.value)) : undefined),
    recipient_ids: useExplicit ? trimmedRecipients : undefined,
    organization_id: selectedOrg.value || undefined,
  };
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
