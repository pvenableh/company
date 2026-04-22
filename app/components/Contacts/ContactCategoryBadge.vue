<template>
  <span
    v-if="category"
    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
    :class="categoryClasses"
  >
    <Icon v-if="showIcon" :name="categoryIcon" class="w-3 h-3" />
    {{ categoryLabel }}
  </span>
</template>

<script setup lang="ts">
import type { Contact } from '~~/shared/directus';

const props = withDefaults(
  defineProps<{
    category: Contact['category'] | null | undefined;
    showIcon?: boolean;
  }>(),
  { showIcon: false },
);

const CATEGORY_META: Record<NonNullable<Contact['category']>, { label: string; icon: string; classes: string }> = {
  client: {
    label: 'Client',
    icon: 'lucide:briefcase',
    classes: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  },
  prospect: {
    label: 'Prospect',
    icon: 'lucide:target',
    classes: 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20',
  },
  architect: {
    label: 'Architect',
    icon: 'lucide:compass',
    classes: 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20',
  },
  developer: {
    label: 'Developer',
    icon: 'lucide:hammer',
    classes: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  },
  hospitality: {
    label: 'Hospitality',
    icon: 'lucide:utensils',
    classes: 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20',
  },
  partner: {
    label: 'Partner',
    icon: 'lucide:handshake',
    classes: 'bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20',
  },
  media: {
    label: 'Media',
    icon: 'lucide:newspaper',
    classes: 'bg-pink-500/10 text-pink-400 ring-1 ring-pink-500/20',
  },
};

const categoryMeta = computed(() => (props.category ? CATEGORY_META[props.category] : null));
const categoryLabel = computed(() => categoryMeta.value?.label ?? '');
const categoryIcon = computed(() => categoryMeta.value?.icon ?? 'lucide:tag');
const categoryClasses = computed(() => categoryMeta.value?.classes ?? 'bg-muted/50 text-muted-foreground');
</script>
