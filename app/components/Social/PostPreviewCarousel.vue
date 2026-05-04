<script setup lang="ts">
const props = defineProps<{
  mediaUrls: string[]
  mediaTypes: ('image' | 'video')[]
  /** Tailwind aspect helper class. 'square' = 1:1 (IG), 'video' = 16:9 (LinkedIn/FB) */
  aspect?: 'square' | 'video'
  rounded?: boolean
}>()

const index = ref(0)

watch(() => props.mediaUrls.length, () => {
  if (index.value >= props.mediaUrls.length) index.value = 0
})

function next() {
  index.value = (index.value + 1) % props.mediaUrls.length
}
function prev() {
  index.value = (index.value - 1 + props.mediaUrls.length) % props.mediaUrls.length
}

const aspectClass = computed(() => {
  return props.aspect === 'video' ? 'aspect-video' : 'aspect-square'
})
</script>

<template>
  <div class="relative bg-gray-100 overflow-hidden" :class="[aspectClass, rounded ? 'rounded-lg' : '']">
    <img
      v-if="mediaTypes[index] === 'image'"
      :src="mediaUrls[index]"
      class="w-full h-full object-cover"
    />
    <div v-else class="w-full h-full flex items-center justify-center bg-black">
      <UIcon name="i-lucide-play-circle" class="w-12 h-12 text-white/80" />
    </div>

    <!-- Counter chip -->
    <div class="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/50 text-white text-[10px] font-medium backdrop-blur-sm">
      {{ index + 1 }}/{{ mediaUrls.length }}
    </div>

    <!-- Prev/next arrows -->
    <button
      v-if="mediaUrls.length > 1"
      class="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
      @click.stop="prev"
    >
      <UIcon name="i-lucide-chevron-left" class="w-4 h-4" />
    </button>
    <button
      v-if="mediaUrls.length > 1"
      class="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
      @click.stop="next"
    >
      <UIcon name="i-lucide-chevron-right" class="w-4 h-4" />
    </button>

    <!-- Page dots -->
    <div class="absolute inset-x-0 bottom-2 flex justify-center gap-1">
      <button
        v-for="(_, i) in mediaUrls"
        :key="i"
        class="w-1.5 h-1.5 rounded-full transition-all"
        :class="i === index ? 'bg-white' : 'bg-white/50'"
        @click.stop="index = i"
      />
    </div>
  </div>
</template>
