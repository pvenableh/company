<template>
  <div class="w-full py-6 min-h-[50vh]">
    <SlackChannels :project="project" />
  </div>
</template>
<script setup>
const props = defineProps({
  project: {
    type: Object,
    default: () => null,
  },
});
</script>
