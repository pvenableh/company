<template>
  <button
    class="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-left text-sm hover:bg-accent/60 transition-all group border border-transparent hover:border-border"
    @click="$emit('add', block)"
  >
    <div
      class="w-7 h-7 rounded flex items-center justify-center shrink-0 transition-colors"
      :class="categoryBg"
    >
      <Icon :name="categoryIcon" class="w-3.5 h-3.5" :class="categoryFg" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="font-medium text-xs truncate text-foreground">{{ block.name }}</p>
      <p v-if="block.description" class="text-[10px] text-muted-foreground truncate leading-snug mt-0.5">
        {{ block.description }}
      </p>
    </div>
    <div class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
      <div class="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
        <Icon name="lucide:plus" class="w-3 h-3 text-primary-foreground" />
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import type { NewsletterBlock } from '~/types/email/blocks';

const props = defineProps<{ block: NewsletterBlock }>();
defineEmits<{ add: [block: NewsletterBlock] }>();

const categoryStyles: Record<string, { bg: string; fg: string; icon: string }> = {
  header: { bg: 'bg-blue-500/10', fg: 'text-blue-500', icon: 'lucide:panel-top' },
  hero: { bg: 'bg-violet-500/10', fg: 'text-violet-500', icon: 'lucide:image' },
  content: { bg: 'bg-green-500/10', fg: 'text-green-500', icon: 'lucide:text' },
  'two-column': { bg: 'bg-amber-500/10', fg: 'text-amber-500', icon: 'lucide:columns-2' },
  'three-column': { bg: 'bg-amber-500/10', fg: 'text-amber-500', icon: 'lucide:columns-3' },
  cta: { bg: 'bg-red-500/10', fg: 'text-red-500', icon: 'lucide:mouse-pointer-click' },
  image: { bg: 'bg-cyan-500/10', fg: 'text-cyan-500', icon: 'lucide:image' },
  stats: { bg: 'bg-indigo-500/10', fg: 'text-indigo-500', icon: 'lucide:bar-chart-3' },
  quote: { bg: 'bg-pink-500/10', fg: 'text-pink-500', icon: 'lucide:quote' },
  list: { bg: 'bg-teal-500/10', fg: 'text-teal-500', icon: 'lucide:list' },
  divider: { bg: 'bg-gray-500/10', fg: 'text-gray-400', icon: 'lucide:minus' },
  social: { bg: 'bg-sky-500/10', fg: 'text-sky-500', icon: 'lucide:share-2' },
  footer: { bg: 'bg-slate-500/10', fg: 'text-slate-500', icon: 'lucide:panel-bottom' },
};

const style = computed(() => categoryStyles[props.block.category] || { bg: 'bg-primary/10', fg: 'text-primary', icon: 'lucide:box' });
const categoryBg = computed(() => style.value.bg);
const categoryFg = computed(() => style.value.fg);
const categoryIcon = computed(() => style.value.icon);
</script>
