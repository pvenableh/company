<script setup lang="ts">
import { getToursForRoute, walkthroughTours } from '~/utils/walkthrough-tours';

const { startTour, isTourCompleted, resetAllTours } = useWalkthrough();
const route = useRoute();

const isOpen = ref(false);

const availableTours = computed(() => {
  // Show tours for current route + global tours
  const routeTours = getToursForRoute(route.path);
  // Also include the navigation tour on any page
  const navTour = walkthroughTours.find(t => t.id === 'navigation-intro');
  const tourIds = new Set(routeTours.map(t => t.id));
  if (navTour && !tourIds.has(navTour.id)) {
    routeTours.push(navTour);
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
            :class="isTourCompleted(tour.id) ? 'bg-green-500/10' : 'bg-primary/10'"
          >
            <UIcon
              v-if="isTourCompleted(tour.id)"
              name="i-heroicons-check"
              class="w-3.5 h-3.5 text-green-500"
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
      </div>
    </template>
  </UPopover>
</template>
