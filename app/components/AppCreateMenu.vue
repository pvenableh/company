<!--
  AppCreateMenu — one context-aware "+ New" button.

  Replaces the scattered per-tab / per-surface "New X" buttons with a single
  primary create menu whose items are whatever is creatable in the current
  context (a project, a client, an app floor…). Pass `items`; each fires its
  own create action (open a create panel, a modal, etc.). Hidden items drop out
  so the same list can be reused with contextual gating.

    <AppCreateMenu :items="[
      { label: 'Task', icon: 'lucide:check-square', onClick: () => addTask() },
      { label: 'Invoice', icon: 'lucide:file-text', onClick: () => newInvoice(), separatorBefore: true },
    ]" />
-->
<script setup lang="ts">
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export interface CreateMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  /** Drop this item (e.g. gated by permission / feature flag). */
  hidden?: boolean;
  /** Render a divider above this item. */
  separatorBefore?: boolean;
}

const props = withDefaults(
  defineProps<{
    items: CreateMenuItem[];
    label?: string;
    align?: 'start' | 'end';
    /** Hide the trigger's text label responsively (passed to UiActionButton). */
    hideLabel?: string;
  }>(),
  { label: 'New', align: 'end' },
);

const visible = computed(() => props.items.filter((i) => !i.hidden));
</script>

<template>
  <DropdownMenu v-if="visible.length">
    <!-- Plain <button> trigger (not UiActionButton) so reka's as-child wiring
         attaches directly to a real DOM element. -->
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-full border border-border text-primary hover:bg-primary/10 hover:border-primary/30 text-xs font-medium h-8 transition-colors active:scale-95"
        :class="hideLabel === 'always' ? 'w-8 px-0 justify-center' : 'px-3'"
        :title="label"
        :aria-label="label"
      >
        <Icon name="lucide:plus" class="w-3.5 h-3.5 shrink-0" />
        <span v-if="hideLabel !== 'always'">{{ label }}</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent :align="align" class="w-52">
      <template v-for="(item, i) in visible" :key="item.label + i">
        <DropdownMenuSeparator v-if="item.separatorBefore && i > 0" />
        <DropdownMenuItem class="text-xs cursor-pointer gap-2" @click="item.onClick">
          <Icon v-if="item.icon" :name="item.icon" class="w-3.5 h-3.5 text-muted-foreground" />
          {{ item.label }}
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
