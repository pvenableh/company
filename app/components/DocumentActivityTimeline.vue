<script setup lang="ts">
/**
 * DocumentActivityTimeline — activity history for a single proposal or contract.
 *
 * Merges two sources:
 *   (a) Earnest AI actions tagged to this document (<AiActivityList>, reading
 *       the ai_actions audit log by entity_type + entity_id).
 *   (b) Directus's built-in change history (directus_activity) for this
 *       collection + item — create/update/delete events, modelled on
 *       app/components/Projects/ActivityTimeline.vue.
 *
 * Proposals/contracts previously had only status timestamps; this brings them
 * to parity with projects/clients/leads/tickets.
 */
const props = defineProps<{
  collection: 'proposals' | 'contracts';
  itemId: string;
}>();

const config = useRuntimeConfig();
const activityItems = useDirectusItems('directus_activity');

const activities = ref<any[]>([]);
const loading = ref(true);

const actionLabels: Record<string, string> = { create: 'Created', update: 'Updated', delete: 'Deleted' };
const docNoun = computed(() => (props.collection === 'contracts' ? 'contract' : 'proposal'));

async function loadActivity() {
  loading.value = true;
  try {
    const rows = await activityItems.list({
      fields: ['id', 'action', 'timestamp', 'collection', 'item', 'user.id', 'user.first_name', 'user.last_name', 'user.avatar'],
      filter: { _and: [{ collection: { _eq: props.collection } }, { item: { _eq: props.itemId } }] },
      sort: ['-timestamp'],
      limit: 50,
    }).catch(() => []);
    activities.value = rows || [];
  } catch (err) {
    console.error('DocumentActivityTimeline: Error loading', err);
    activities.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(loadActivity);
watch(() => [props.collection, props.itemId], loadActivity);

function formatTime(ts?: string | null) {
  if (!ts) return '';
  const date = new Date(ts);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getUserName(u: any) {
  if (!u) return 'System';
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown';
}
function getUserAvatar(u: any): string | undefined {
  if (!u?.avatar) return undefined;
  return `${config.public.directusUrl}/assets/${u.avatar}?width=64&height=64&fit=cover`;
}
</script>

<template>
  <div class="space-y-6">
    <!-- (a) AI actions on this document -->
    <div>
      <div class="flex items-center gap-2 mb-3">
        <EarnestIcon class="w-4 h-4 text-primary" />
        <h3 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Earnest AI</h3>
      </div>
      <AiActivityList :entity-type="collection" :entity-id="itemId" />
    </div>

    <!-- (b) Change history -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <UIcon name="lucide:history" class="w-4 h-4 text-muted-foreground" />
          <h3 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Change history</h3>
        </div>
        <button
          @click="loadActivity"
          :disabled="loading"
          class="text-[10px] text-primary hover:underline disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="space-y-3">
        <div v-for="n in 3" :key="n" class="flex items-start gap-3">
          <div class="w-7 h-7 rounded-full bg-muted animate-pulse shrink-0" />
          <div class="flex-1 space-y-1.5">
            <div class="h-3 w-36 bg-muted rounded animate-pulse" />
            <div class="h-2 w-20 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="!activities.length" class="text-center py-8">
        <UIcon name="lucide:history" class="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
        <p class="text-sm text-muted-foreground">No change history yet</p>
      </div>

      <!-- Timeline -->
      <div v-else class="relative">
        <div class="absolute left-3.5 top-0 bottom-0 w-px bg-border" />
        <div v-for="item in activities" :key="item.id" class="relative flex items-start gap-3 pb-5">
          <div class="relative z-10 shrink-0">
            <UAvatar
              v-if="item.user"
              :src="getUserAvatar(item.user)"
              :alt="getUserName(item.user)"
              size="xs"
              class="ring-2 ring-background"
            />
            <div v-else class="w-7 h-7 rounded-full bg-muted flex items-center justify-center ring-2 ring-background">
              <UIcon name="lucide:file-text" class="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </div>
          <div class="flex-1 min-w-0 pt-0.5">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-medium text-foreground">{{ getUserName(item.user) }}</span>
              <span class="text-[11px] text-muted-foreground">
                {{ actionLabels[item.action] || item.action }} this {{ docNoun }}
              </span>
            </div>
            <span class="text-[10px] text-muted-foreground">{{ formatTime(item.timestamp) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
