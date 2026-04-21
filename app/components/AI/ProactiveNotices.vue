<script setup lang="ts">
/**
 * Proactive AI Notices — renders contextual AI observations on entity views.
 * Uses AccentCard with priority coloring (matching SuggestionCard pattern).
 */

const props = defineProps<{
  entityType:
    | 'client'
    | 'project'
    | 'invoice'
    | 'contact'
    | 'proposal'
    | 'team'
    | 'ticket'
    | 'lead'
    | 'email'
    | 'marketing'
    | 'financials';
  entityId: string;
}>();

const router = useRouter();
const { visibleNotices, isLoading, fetchNotices, dismissNotice } = useAINotices();

const expanded = ref(false);
const maxCollapsed = 2;

const displayedNotices = computed(() => {
  if (expanded.value) return visibleNotices.value;
  return visibleNotices.value.slice(0, maxCollapsed);
});

const hasMore = computed(() => visibleNotices.value.length > maxCollapsed);

// Fetch on mount and when entityId changes
watch(() => [props.entityType, props.entityId], ([type, id]) => {
  if (type && id) {
    expanded.value = false;
    fetchNotices(type as string, id as string);
  }
}, { immediate: true });

const { getPriorityBg, getPriorityAccent, getPriorityIconClass } = useStatusStyle();

const handleAction = (notice: any) => {
  if (notice.actionRoute) {
    router.push(notice.actionRoute);
  }
};
</script>

<template>
  <div v-if="visibleNotices.length > 0" class="mb-4">
    <!-- Header -->
    <div class="flex items-center gap-1.5 mb-2">
      <UIcon name="i-heroicons-sparkles" class="w-3.5 h-3.5 text-primary" />
      <span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Earnest Notices
      </span>
    </div>

    <!-- Notice cards -->
    <div class="space-y-2">
      <div
        v-for="notice in displayedNotices"
        :key="notice.id"
        class="group"
      >
        <AccentCard
          :accent="getPriorityAccent(notice.priority)"
          :class="[getPriorityBg(notice.priority), 'transition-all duration-200']"
        >
          <div class="flex items-start gap-3">
            <!-- Icon -->
            <div class="flex-shrink-0 mt-0.5">
              <UIcon
                :name="notice.icon"
                class="w-4 h-4"
                :class="getPriorityIconClass(notice.priority)"
              />
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-foreground">
                {{ notice.title }}
              </p>
              <p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {{ notice.description }}
              </p>
              <button
                v-if="notice.actionLabel"
                @click="handleAction(notice)"
                class="text-xs font-medium text-primary hover:underline mt-1"
              >
                {{ notice.actionLabel }} &rarr;
              </button>
            </div>

            <!-- Dismiss -->
            <button
              @click.stop="dismissNotice(notice.id)"
              class="flex-shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-background/60 transition-all"
              title="Dismiss"
            >
              <UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </AccentCard>
      </div>
    </div>

    <!-- Show more / less -->
    <button
      v-if="hasMore"
      @click="expanded = !expanded"
      class="mt-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
    >
      {{ expanded ? 'Show less' : `Show ${visibleNotices.length - maxCollapsed} more` }}
    </button>
  </div>
</template>
