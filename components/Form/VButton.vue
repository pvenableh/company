<template>
  <button :type="type" class="relative overflow-hidden p-px" :class="[
    'btn',
    {
      'btn-default': variant === 'default',
      'btn-primary': variant === 'primary',
      'btn-outline': variant === 'outline',
      'btn-danger': variant === 'danger',
    },
  ]">
    <div v-if="glow" class="glow inset-0 w-[60px] h-[60px] absolute rotate-45"></div>
    <div class="block bg-black rounded-md z-10 relative px-6 py-2 rounded w-full h-full">
    <slot />
  </div>
  </button>
</template>

<script setup>
const props = defineProps({
  type: {
    type: String,
    default: 'button',
  },
  variant: {
    type: String,
    default: 'default',
  },
  glow: {
    type: Boolean,
    default: true,
  }
})
</script>

<style>

.glow {
  animation: move 4s linear infinite;
  offset-path: rect(0% auto 100% auto);
  background: radial-gradient(#00FFED, var(--cyan), transparent);
}

@keyframes move {
  0% {
    offset-distance: 0%;
  }

  100% {
    offset-distance: 100%;
  }
}

.btn {
  background: var(--black);
  @apply text-white inline-flex border-transparent items-center justify-center tracking-wider font-sans uppercase shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:hover:scale-95 transition ease-in-out duration-150 rounded relative;
}

.btn-default {}

.btn-primary {}

.btn-outline {}

.btn-danger {}
</style>