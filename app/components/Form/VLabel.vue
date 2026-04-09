<template>
  <label
    :for="name"
    class="block mt-4 mb-1 text-sm uppercase tracking-wider purple-txt"
    >{{ label }}</label
  >
</template>

<script setup>
const props = defineProps({
  label: {
    type: String,
    default: '',
  },
  name: {
    type: String,
    default: '',
  },
})
</script>
