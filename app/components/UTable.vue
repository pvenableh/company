<script setup lang="ts">
/**
 * UTable - NuxtUI-compatible table wrapper for shadcn-vue Table
 *
 * Supports:
 * - :columns with { key, label, sortable }
 * - :rows with row objects
 * - Named slots: #[column.key]-data="{ row }" for custom cell rendering
 * - #expand="{ row }" for expandable rows
 * - Row class from row.class property
 */

import { computed, ref } from "vue";
import { cn, convertIconName } from "@/lib/utils";

interface Column {
  key: string;
  label?: string;
  sortable?: boolean;
}

const props = withDefaults(
  defineProps<{
    columns: Column[];
    rows: any[];
    class?: string;
  }>(),
  {}
);

const slots = defineSlots();

// Sorting state
const sortColumn = ref<string | null>(null);
const sortDirection = ref<"asc" | "desc">("asc");

function toggleSort(column: Column) {
  if (!column.sortable) return;

  if (sortColumn.value === column.key) {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
  } else {
    sortColumn.value = column.key;
    sortDirection.value = "asc";
  }
}

// Expandable rows
const expandedRows = ref<Set<number>>(new Set());

function toggleExpand(index: number) {
  if (expandedRows.value.has(index)) {
    expandedRows.value.delete(index);
  } else {
    expandedRows.value.add(index);
  }
}

const hasExpandSlot = computed(() => !!slots.expand);

// Get nested value from object using dot notation
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

// Sorted rows
const sortedRows = computed(() => {
  if (!sortColumn.value) return props.rows;

  return [...props.rows].sort((a, b) => {
    const aVal = getNestedValue(a, sortColumn.value!);
    const bVal = getNestedValue(b, sortColumn.value!);

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    let comparison = 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      comparison = aVal.localeCompare(bVal);
    } else {
      comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    }

    return sortDirection.value === "desc" ? -comparison : comparison;
  });
});
</script>

<template>
  <div :class="cn('relative w-full overflow-auto', props.class)">
    <table class="w-full caption-bottom text-sm">
      <thead class="[&_tr]:border-b">
        <tr class="border-b transition-colors">
          <th
            v-if="hasExpandSlot"
            class="text-foreground h-10 px-2 text-left align-middle font-medium w-10"
          />
          <th
            v-for="column in columns"
            :key="column.key"
            class="text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap"
          >
            <button
              v-if="column.sortable"
              class="flex items-center gap-1 hover:text-foreground/80 cursor-pointer"
              @click="toggleSort(column)"
            >
              {{ column.label }}
              <span v-if="sortColumn === column.key" class="text-xs">
                {{ sortDirection === "asc" ? "\u25B2" : "\u25BC" }}
              </span>
            </button>
            <span v-else>{{ column.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody class="[&_tr:last-child]:border-0">
        <template v-for="(row, rowIndex) in sortedRows" :key="row.id || rowIndex">
          <tr
            class="border-b transition-colors hover:bg-muted/50"
            :class="row.class || ''"
            @click="hasExpandSlot ? toggleExpand(rowIndex) : undefined"
            :style="hasExpandSlot ? 'cursor: pointer' : ''"
          >
            <td v-if="hasExpandSlot" class="p-2 align-middle w-10">
              <Icon
                :name="expandedRows.has(rowIndex) ? 'heroicons:chevron-down' : 'heroicons:chevron-right'"
                class="h-4 w-4 text-gray-400 transition-transform"
              />
            </td>
            <td
              v-for="column in columns"
              :key="column.key"
              class="p-2 align-middle whitespace-nowrap"
            >
              <slot
                :name="`${column.key}-data`"
                :row="row"
                :column="column"
                :index="rowIndex"
              >
                {{ getNestedValue(row, column.key) }}
              </slot>
            </td>
          </tr>
          <!-- Expanded content -->
          <tr v-if="hasExpandSlot && expandedRows.has(rowIndex)">
            <td :colspan="columns.length + 1" class="p-0">
              <slot name="expand" :row="row" :index="rowIndex" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
