<script setup lang="ts">
import { getTourById } from '~/utils/walkthrough-tours';

const { activeTourId, activeStepIndex, isActive, nextStep, prevStep, skipTour } = useWalkthrough();

const activeTour = computed(() => {
  if (!activeTourId.value) return null;
  return getTourById(activeTourId.value);
});

const currentStep = computed(() => {
  if (!activeTour.value) return null;
  return activeTour.value.steps[activeStepIndex.value] || null;
});

const totalSteps = computed(() => activeTour.value?.steps.length || 0);

function handleNext() {
  nextStep(totalSteps.value);
}

// Close on Escape
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isActive.value) {
    skipTour();
  }
}

onMounted(() => {
  if (import.meta.client) {
    document.addEventListener('keydown', handleKeydown);
  }
});

onUnmounted(() => {
  if (import.meta.client) {
    document.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<template>
  <WalkthroughStep
    v-if="isActive && currentStep"
    :target="currentStep.target"
    :title="currentStep.title"
    :description="currentStep.description"
    :placement="currentStep.placement"
    :step-number="activeStepIndex + 1"
    :total-steps="totalSteps"
    @next="handleNext"
    @prev="prevStep"
    @skip="skipTour"
  />
</template>
