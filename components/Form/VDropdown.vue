<template>
  <div @mouseleave="menu = false" class="dropdown relative">
    <a @mouseover="menu = true" class="z-10"><slot /></a>
    <transition name="fade">
      <ul v-if="menu" tabindex="0" class="dropdown-content absolute w-52 z-10">
        <li v-for="(item, index) in items" :key="index">
          <nuxt-link :to="item.link">{{ item.label }}</nuxt-link>
        </li>
      </ul>
    </transition>
  </div>
</template>

<script setup>
const menu = useState('menu', () => false)

const props = defineProps({
  items: {
    type: Array,
    default: null,
  },
})
</script>
<style lang="postcss" scoped>
.dropdown {
  &-content {
    li {
      /* opacity: 0;
      transform: translateY(-10px); */
      transition: all 0.3s var(--curve);
      background-color: rgba(255, 255, 255, 0.5);
      @supports (-webkit-backdrop-filter: none) or (backdrop-filter: none) {
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
        background-color: rgba(255, 255, 255, 0.5);
      }
      @apply block w-full pl-4;
      a {
        width: 100%;
        @apply block w-full pl-4;
      }
    }
    li:nth-of-type(2) {
      transition-delay: 0.025s;
    }
    li:nth-of-type(3) {
      transition-delay: 0.05s;
    }
    li:nth-of-type(4) {
      transition-delay: 0.075s;
    }
  }
}
/* .dropdown-content.open {
  li {
    opacity: 1;
    transform: translateY(0px);
  }
} */
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s var(--curve);
  li {
    opacity: 1;
    transform: translateY(0px);
    transition: all 0.3s var(--curve);
  }
}

.fade-enter-from,
.fade-leave-to {
  li {
    opacity: 0;
    transform: translateY(-10px);
  }
}
</style>