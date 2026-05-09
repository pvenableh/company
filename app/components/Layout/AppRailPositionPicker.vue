<script setup lang="ts">
/**
 * AppRailPositionPicker — apps-shell chrome popover.
 *
 * Five options: left / right / top / bottom / floating. Selection
 * persists via `useAppsMode().setRailPosition`. Mobile (< md) forces
 * bottom regardless, so the picker shows a hint banner there.
 */
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { RailPosition } from '~/composables/useAppsMode';

const { railPosition, storedRailPosition, setRailPosition } = useAppsMode();

const options: Array<{ id: RailPosition; label: string; icon: string; hint: string }> = [
  { id: 'left', label: 'Left', icon: 'lucide:panel-left', hint: 'Vertical column on the left' },
  { id: 'right', label: 'Right', icon: 'lucide:panel-right', hint: 'Vertical column on the right' },
  { id: 'top', label: 'Top', icon: 'lucide:panel-top', hint: 'Horizontal strip below the header' },
  { id: 'bottom', label: 'Bottom', icon: 'lucide:panel-bottom', hint: 'Horizontal strip pinned to the bottom' },
  { id: 'floating', label: 'Floating', icon: 'lucide:focus', hint: 'Bottom-center pill that stays out of the way' },
];

const isMobileForced = computed(() => railPosition.value === 'bottom' && storedRailPosition.value !== 'bottom');
const open = ref(false);
const saving = ref(false);

async function handlePick(next: RailPosition) {
  if (storedRailPosition.value === next) {
    open.value = false;
    return;
  }
  saving.value = true;
  try {
    await setRailPosition(next);
    open.value = false;
  } catch {
    // surface gracefully — picker stays open so user can retry
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors"
        :title="`Rail position: ${storedRailPosition}`"
        aria-label="Choose app rail position"
      >
        <Icon name="lucide:layout-grid" class="size-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-64 p-1.5" align="end">
      <div class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Rail Position
      </div>
      <div class="space-y-0.5">
        <button
          v-for="opt in options"
          :key="opt.id"
          type="button"
          :disabled="saving"
          class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
          :class="{ 'bg-primary/10 text-primary': storedRailPosition === opt.id }"
          @click="handlePick(opt.id)"
        >
          <Icon :name="opt.icon" class="size-4 shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium leading-tight">{{ opt.label }}</div>
            <div class="text-[10px] text-muted-foreground leading-tight truncate">{{ opt.hint }}</div>
          </div>
          <Icon
            v-if="storedRailPosition === opt.id"
            name="lucide:check"
            class="size-3.5 text-primary shrink-0"
          />
        </button>
      </div>
      <div
        v-if="isMobileForced"
        class="mt-1.5 px-2 py-1.5 rounded-md bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400 leading-snug"
      >
        Mobile forces Bottom. Your saved choice ({{ storedRailPosition }}) returns on wider screens.
      </div>
    </PopoverContent>
  </Popover>
</template>
