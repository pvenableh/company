<script setup lang="ts">
/**
 * UDropdown - NuxtUI-compatible dropdown wrapper for shadcn-vue DropdownMenu
 *
 * Supports:
 * - :items as array of groups (arrays) or flat array of items
 * - Each item: { label, icon, to, click, external, disabled }
 * - Default slot for trigger element
 */

import { convertIconName } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DropdownItem {
  label: string;
  icon?: string;
  to?: string;
  click?: () => void;
  external?: boolean;
  disabled?: boolean;
}

const props = defineProps<{
  items: DropdownItem[] | DropdownItem[][];
}>();

// Normalize items to always be grouped
function normalizedGroups(): DropdownItem[][] {
  if (!props.items || props.items.length === 0) return [];

  // Check if first element is an array (grouped format)
  if (Array.isArray(props.items[0])) {
    return props.items as DropdownItem[][];
  }

  // Flat format — wrap in single group
  return [props.items as DropdownItem[]];
}

function handleItemClick(item: DropdownItem) {
  if (item.click) {
    item.click();
  } else if (item.to) {
    if (item.external) {
      window.location.href = item.to;
    } else {
      navigateTo(item.to);
    }
  }
}

function getIconName(icon?: string): string {
  if (!icon) return "";
  return convertIconName(icon);
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <slot />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-48">
      <template v-for="(group, groupIndex) in normalizedGroups()" :key="groupIndex">
        <DropdownMenuSeparator v-if="groupIndex > 0" />
        <DropdownMenuGroup>
          <DropdownMenuItem
            v-for="(item, itemIndex) in group"
            :key="itemIndex"
            :disabled="item.disabled"
            class="cursor-pointer"
            @click="handleItemClick(item)"
          >
            <Icon
              v-if="getIconName(item.icon)"
              :name="getIconName(item.icon)"
              class="mr-2 h-4 w-4"
            />
            {{ item.label }}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
