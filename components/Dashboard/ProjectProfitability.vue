<template>
  <div class="ios-card p-5">
    <h3 class="font-medium text-sm flex items-center gap-2 mb-4">
      <Icon name="lucide:folder" class="w-4 h-4 text-muted-foreground" />
      Revenue by Project
    </h3>

    <div v-if="projectData.length" class="space-y-3">
      <div
        v-for="project in projectData.slice(0, 8)"
        :key="project.name"
        class="flex items-center gap-3"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-medium truncate">{{ project.name }}</span>
            <span class="text-sm font-semibold ml-2">{{ formatCurrency(project.total) }}</span>
          </div>
          <div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              class="h-full bg-blue-500 rounded-full transition-all"
              :style="{ width: maxTotal > 0 ? `${(project.total / maxTotal) * 100}%` : '0%' }"
            />
          </div>
          <div class="flex justify-between mt-0.5 text-[10px] text-muted-foreground">
            <span>{{ project.count }} invoices</span>
            <span>
              <span class="text-emerald-500">{{ project.paidCount }} paid</span>
              <span v-if="project.unpaidCount > 0" class="text-amber-500 ml-1">{{ project.unpaidCount }} unpaid</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="py-8 text-center text-sm text-muted-foreground">
      No project data available
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Invoice } from '~/types/directus';

const props = defineProps<{
  invoices: Invoice[];
}>();

const projectData = computed(() => {
  const map = new Map<string, { name: string; total: number; count: number; paidCount: number; unpaidCount: number }>();

  for (const inv of props.invoices) {
    const projectName = inv.project && typeof inv.project === 'object'
      ? (inv.project as any).title || 'Unknown'
      : 'No Project';

    const existing = map.get(projectName) || { name: projectName, total: 0, count: 0, paidCount: 0, unpaidCount: 0 };
    existing.total += Number(inv.total_amount) || 0;
    existing.count++;
    if (inv.status === 'paid') {
      existing.paidCount++;
    } else if (inv.status !== 'archived') {
      existing.unpaidCount++;
    }
    map.set(projectName, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
});

const maxTotal = computed(() => {
  if (!projectData.value.length) return 0;
  return projectData.value[0].total;
});
</script>
