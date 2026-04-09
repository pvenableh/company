/**
 * useWalkthrough — manages interactive tour state.
 *
 * Tracks active tour, current step, and completed tours.
 * Persists completion state to localStorage.
 */

interface WalkthroughStep {
  target: string;
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

interface WalkthroughTour {
  id: string;
  title: string;
  description?: string;
  route: string;
  icon?: string;
  steps: WalkthroughStep[];
}

const STORAGE_KEY = 'earnest-walkthrough-state';

// Shared state across components
const activeTourId = ref<string | null>(null);
const activeStepIndex = ref(0);
const completedTours = ref<Set<string>>(new Set());

// Load from localStorage on first use
if (import.meta.client) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.completed)) {
        completedTours.value = new Set(parsed.completed);
      }
    }
  } catch {}
}

function persistState() {
  if (!import.meta.client) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completed: [...completedTours.value],
    }));
  } catch {}
}

export function useWalkthrough() {
  const route = useRoute();

  const isActive = computed(() => activeTourId.value !== null);

  function startTour(tourId: string) {
    activeTourId.value = tourId;
    activeStepIndex.value = 0;
  }

  function nextStep(totalSteps: number) {
    if (activeStepIndex.value < totalSteps - 1) {
      activeStepIndex.value++;
    } else {
      completeTour();
    }
  }

  function prevStep() {
    if (activeStepIndex.value > 0) {
      activeStepIndex.value--;
    }
  }

  function completeTour() {
    if (activeTourId.value) {
      completedTours.value.add(activeTourId.value);
      persistState();
    }
    activeTourId.value = null;
    activeStepIndex.value = 0;
  }

  function skipTour() {
    activeTourId.value = null;
    activeStepIndex.value = 0;
  }

  function isTourCompleted(tourId: string): boolean {
    return completedTours.value.has(tourId);
  }

  function resetAllTours() {
    completedTours.value.clear();
    persistState();
  }

  return {
    activeTourId: readonly(activeTourId),
    activeStepIndex: readonly(activeStepIndex),
    completedTours: readonly(completedTours),
    isActive,
    startTour,
    nextStep,
    prevStep,
    completeTour,
    skipTour,
    isTourCompleted,
    resetAllTours,
  };
}

export type { WalkthroughStep, WalkthroughTour };
