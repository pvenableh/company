<script setup lang="ts">
/**
 * Proactive AI Notices — renders contextual AI observations on entity views.
 * Uses AccentCard with priority coloring (matching SuggestionCard pattern).
 */

const props = defineProps<{
  entityType: 'client' | 'project' | 'invoice';
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

const priorityColors: Record<string, string> = {
  urgent: 'bg-red-50/50 dark:bg-red-900/10',
  high: 'bg-amber-50/50 dark:bg-amber-900/10',
  medium: 'bg-blue-50/30 dark:bg-blue-900/10',
  low: 'bg-gray-50/30 dark:bg-gray-800/30',
};

const priorityLineColors: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-blue-500',
  low: 'bg-gray-300',
};

const priorityIconColors: Record<string, string> = {
  urgent: 'text-red-500',
  high: 'text-amber-500',
  medium: 'text-blue-500',
  low: 'text-gray-400',
};

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
          :accent="priorityLineColors[notice.priority] || priorityLineColors.low"
          :class="[priorityColors[notice.priority] || priorityColors.low, 'transition-all duration-200']"
        >
          <div class="flex items-start gap-3">
            <!-- Icon -->
            <div class="flex-shrink-0 mt-0.5">
              <UIcon
                :name="notice.icon"
                class="w-4 h-4"
                :class="priorityIconColors[notice.priority] || 'text-gray-400'"
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
