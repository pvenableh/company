<script setup lang="ts">
/**
 * AppRailPositionPicker — "Rail Settings" chrome popover trigger.
 *
 * The settings UI itself lives in `LayoutAppRailSettingsPanel` so the
 * same four sections (position / show labels / glass chrome / palette)
 * can also render inline on `/portal/account` → Appearance. This
 * component is just the chrome button + popover frame.
 */
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const open = ref(false);
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors"
        title="Rail settings"
        aria-label="Open rail settings"
      >
        <Icon name="lucide:layout-grid" class="size-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-72 p-1.5 max-h-[80vh] overflow-y-auto" align="end">
      <LayoutAppRailSettingsPanel density="compact" />
    </PopoverContent>
  </Popover>
</template>
