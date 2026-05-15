<script setup lang="ts">
import { getToursForRoute, walkthroughTours } from '~/utils/walkthrough-tours';
import type { SupportType } from '~/composables/useReportIssue';

const { startTour, isTourCompleted, resetAllTours } = useWalkthrough();
const { currentLayout } = useWalkthroughLayout();
const { openReportModal } = useReportIssue();
const router = useRouter();
const route = useRoute();

const isOpen = ref(false);

type FeedbackActionId = SupportType | 'my-reports';

interface FeedbackAction {
  id: FeedbackActionId;
  label: string;
  description: string;
  icon: string;
}

const FEEDBACK_ACTIONS: FeedbackAction[] = [
  { id: 'bug', label: 'Report a bug', description: 'Something is broken', icon: 'lucide:bug' },
  { id: 'feature', label: 'Request a feature', description: 'Idea for what to build next', icon: 'lucide:sparkles' },
  { id: 'question', label: 'Ask a question', description: "We'll get back to you", icon: 'lucide:circle-help' },
  { id: 'feedback', label: 'Send feedback', description: 'General thoughts', icon: 'lucide:message-circle' },
  { id: 'my-reports', label: 'My reports', description: "Track what you've submitted", icon: 'lucide:inbox' },
];

function handleFeedback(id: FeedbackActionId) {
  isOpen.value = false;
  if (id === 'my-reports') {
    const target = currentLayout.value === 'portal' ? '/portal/support' : '/support';
    setTimeout(() => router.push(target), 120);
    return;
  }
  setTimeout(() => openReportModal(id), 120);
}

// Each shell has a "fallback" tour that explains the chrome itself so users
// always have at least one option when they're on a page without a dedicated
// guide. Classic gets navigation-intro; apps gets the AppRail/chrome intro;
// portal gets the welcome tour.
const FALLBACK_BY_LAYOUT: Record<'classic' | 'apps' | 'portal', string> = {
  classic: 'navigation-intro',
  apps: 'apps-shell-intro',
  portal: 'portal-welcome',
};

const availableTours = computed(() => {
  const layout = currentLayout.value;
  const routeTours = getToursForRoute(route.path, layout);
  const fallbackId = FALLBACK_BY_LAYOUT[layout];
  const fallback = walkthroughTours.find(t => t.id === fallbackId);
  const ids = new Set(routeTours.map(t => t.id));
  if (fallback && !ids.has(fallback.id)) {
    routeTours.push(fallback);
  }
  return routeTours;
});

const hasCompletedAny = computed(() => {
  return walkthroughTours.some(t => isTourCompleted(t.id));
});

function handleStartTour(tourId: string) {
  isOpen.value = false;
  // Small delay so menu closes before spotlight appears
  setTimeout(() => startTour(tourId), 150);
}

function handleReset() {
  resetAllTours();
  isOpen.value = false;
}
</script>

<template>
  <UPopover v-model:open="isOpen" mode="click" :popper="{ placement: 'bottom-end', offsetDistance: 8 }">
    <button
      class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors"
      :class="{ 'text-primary': isOpen }"
    >
      <UIcon name="i-heroicons-question-mark-circle" class="w-5 h-5" />
    </button>

    <template #panel>
      <div class="w-64 p-2">
        <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1.5">
          Feature Guides
        </p>

        <div v-if="availableTours.length === 0" class="px-2 py-4 text-center text-xs text-muted-foreground">
          No guides available for this page.
        </div>

        <button
          v-for="tour in availableTours"
          :key="tour.id"
          class="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
          @click="handleStartTour(tour.id)"
        >
          <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            :class="isTourCompleted(tour.id) ? 'bg-success/10' : 'bg-primary/10'"
          >
            <UIcon
              v-if="isTourCompleted(tour.id)"
              name="i-heroicons-check"
              class="w-3.5 h-3.5 text-success"
            />
            <UIcon
              v-else
              :name="tour.icon || 'i-heroicons-book-open'"
              class="w-3.5 h-3.5 text-primary"
            />
          </div>
          <div class="min-w-0">
            <p class="text-xs font-medium text-foreground">{{ tour.title }}</p>
            <p v-if="tour.description" class="text-[10px] text-muted-foreground truncate">{{ tour.description }}</p>
          </div>
        </button>

        <div v-if="hasCompletedAny" class="border-t border-border/40 mt-1.5 pt-1.5">
          <button
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
            @click="handleReset"
          >
            <UIcon name="i-heroicons-arrow-path" class="w-3.5 h-3.5 text-muted-foreground" />
            <span class="text-[10px] text-muted-foreground">Reset all guides</span>
          </button>
        </div>

        <div class="border-t border-border/40 mt-1.5 pt-1.5">
          <p class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1.5">
            Help &amp; Feedback
          </p>

          <button
            v-for="action in FEEDBACK_ACTIONS"
            :key="action.id"
            class="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
            @click="handleFeedback(action.id)"
          >
            <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-primary/10">
              <UIcon :name="action.icon" class="w-3.5 h-3.5 text-primary" />
            </div>
            <div class="min-w-0">
              <p class="text-xs font-medium text-foreground">{{ action.label }}</p>
              <p class="text-[10px] text-muted-foreground truncate">{{ action.description }}</p>
            </div>
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>
