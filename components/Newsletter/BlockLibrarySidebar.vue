<template>
  <div class="flex flex-col h-full">
    <div class="px-3 py-3 border-b">
      <h2 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Block Library
      </h2>
      <input
        v-model="search"
        type="text"
        placeholder="Search blocks…"
        class="mt-2 w-full rounded-md border px-2.5 py-1.5 text-xs bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>

    <div class="flex-1 overflow-y-auto px-2 py-2 space-y-3">
      <div v-for="(blocks, category) in filteredLibrary" :key="category">
        <p class="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {{ formatCategory(category as string) }}
        </p>
        <NewsletterBlockLibraryItem
          v-for="block in blocks"
          :key="block.id"
          :block="block"
          @add="$emit('add-block', $event)"
        />
      </div>

      <div
        v-if="Object.keys(filteredLibrary).length === 0"
        class="text-center py-8 text-xs text-muted-foreground"
      >
        No blocks found
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NewsletterBlock } from '~/types/email/blocks';

const props = defineProps<{
  library: Record<string, NewsletterBlock[]>;
}>();

defineEmits<{ 'add-block': [block: NewsletterBlock] }>();

const search = ref('');

const filteredLibrary = computed(() => {
  if (!search.value.trim()) return props.library;

  const q = search.value.toLowerCase();
  const result: Record<string, NewsletterBlock[]> = {};

  for (const [category, blocks] of Object.entries(props.library)) {
    const matched = blocks.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
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

function formatCategory(cat: string): string {
  return categoryLabels[cat] || cat;
}
</script>
