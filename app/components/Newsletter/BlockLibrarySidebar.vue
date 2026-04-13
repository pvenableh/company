<template>
  <div class="flex flex-col h-full">
    <div class="px-3 py-3 border-b">
      <h2 class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Block Library
      </h2>
      <div class="relative">
        <Icon name="lucide:search" class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="Search blocks…"
          class="w-full rounded-full border bg-muted/30 pl-7 pr-2.5 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
        />
        <button
          v-if="search"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          @click="search = ''"
        >
          <Icon name="lucide:x" class="w-3 h-3" />
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-2 py-2 space-y-2">
      <div v-for="(blocks, category) in filteredLibrary" :key="category">
        <button
          class="flex items-center gap-1.5 w-full px-2 py-1 text-left group"
          @click="toggleCategory(category as string)"
        >
          <Icon
            :name="collapsedCategories.has(category as string) ? 'lucide:chevron-right' : 'lucide:chevron-down'"
            class="w-3 h-3 text-muted-foreground transition-transform"
          />
          <Icon :name="getCategoryIcon(category as string)" class="w-3 h-3" :class="getCategoryColor(category as string)" />
          <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
            {{ formatCategory(category as string) }}
          </span>
          <span class="text-[10px] text-muted-foreground/60 tabular-nums">{{ blocks.length }}</span>
        </button>

        <Transition name="slide-down">
          <div v-if="!collapsedCategories.has(category as string)" class="mt-0.5">
            <NewsletterBlockLibraryItem
              v-for="block in blocks"
              :key="block.id"
              :block="block"
              @add="$emit('add-block', $event)"
            />
          </div>
        </Transition>
      </div>

      <div
        v-if="Object.keys(filteredLibrary).length === 0"
        class="text-center py-8"
      >
        <Icon name="lucide:search-x" class="w-6 h-6 mx-auto mb-2 text-muted-foreground/40" />
        <p class="text-xs text-muted-foreground">No blocks found</p>
        <button class="text-xs text-primary mt-1" @click="search = ''">Clear search</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NewsletterBlock } from '~~/shared/email/blocks';

const props = defineProps<{
  library: Record<string, NewsletterBlock[]>;
}>();

defineEmits<{ 'add-block': [block: NewsletterBlock] }>();

const search = ref('');
const collapsedCategories = ref(new Set<string>());

function toggleCategory(category: string) {
  if (collapsedCategories.value.has(category)) {
    collapsedCategories.value.delete(category);
  } else {
    collapsedCategories.value.add(category);
  }
}

const filteredLibrary = computed(() => {
  if (!search.value.trim()) return props.library;

  const q = search.value.toLowerCase();
  const result: Record<string, NewsletterBlock[]> = {};

  for (const [category, blocks] of Object.entries(props.library)) {
    const matched = blocks.filter(
      (b) =>
        b.name?.toLowerCase().includes(q) ||
        b.category?.toLowerCase().includes(q) ||
        b.description?.toLowerCase().includes(q)
    );
    if (matched.length > 0) result[category] = matched;
  }

  return result;
});

const categoryLabels: Record<string, string> = {
  header: 'Header',
  hero: 'Hero',
  content: 'Content',
  'two-column': 'Two Column',
  'three-column': 'Three Column',
  cta: 'Call to Action',
  image: 'Image',
  stats: 'Stats / Numbers',
  quote: 'Quote / Testimonial',
  list: 'List / Checklist',
  divider: 'Divider',
  social: 'Social Links',
  footer: 'Footer',
};

const categoryIcons: Record<string, string> = {
  header: 'lucide:panel-top',
  hero: 'lucide:image',
  content: 'lucide:text',
  'two-column': 'lucide:columns-2',
  'three-column': 'lucide:columns-3',
  cta: 'lucide:mouse-pointer-click',
  image: 'lucide:image',
  stats: 'lucide:bar-chart-3',
  quote: 'lucide:quote',
  list: 'lucide:list',
  divider: 'lucide:minus',
  social: 'lucide:share-2',
  footer: 'lucide:panel-bottom',
};

const categoryColors: Record<string, string> = {
  header: 'text-blue-500',
  hero: 'text-violet-500',
  content: 'text-green-500',
  'two-column': 'text-amber-500',
  'three-column': 'text-amber-500',
  cta: 'text-red-500',
  image: 'text-cyan-500',
  stats: 'text-indigo-500',
  quote: 'text-pink-500',
  list: 'text-teal-500',
  divider: 'text-gray-400',
  social: 'text-sky-500',
  footer: 'text-slate-500',
};

function formatCategory(cat: string): string {
  return categoryLabels[cat] || cat;
}

function getCategoryIcon(cat: string): string {
  return categoryIcons[cat] || 'lucide:box';
}

function getCategoryColor(cat: string): string {
  return categoryColors[cat] || 'text-muted-foreground';
}
</script>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}
.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 1000px;
  opacity: 1;
}
</style>
