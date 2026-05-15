<script setup lang="ts">
/**
 * AppRailPositionPicker — "Rail Settings" chrome popover.
 *
 * Consolidates rail customisation into one popover with three sections:
 *   1. Position — left / right / top / bottom / floating
 *   2. Palette  — Default / Oceanic / Gradient Blues (or whatever ships
 *                 in APP_PALETTES)
 *   3. Show labels toggle (top/bottom positions only)
 *
 * Selections persist via `useAppsMode` (position + label visibility) and
 * `useAppPalette` (palette). The standalone AppPalettePicker is no
 * longer mounted; everything funnels through this one trigger.
 */
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import type { RailPosition } from '~/composables/useAppsMode';
import { useAppPalette, type AppPaletteId } from '~/composables/useAppPalette';
import {
  APP_PALETTES,
  APP_PALETTE_IDS,
  APP_ORDER,
  APP_FOOTER_ORDER,
  getAppAccents,
} from '~/composables/useAppAccent';

const { railPosition, storedRailPosition, setRailPosition, railShowLabels, setRailShowLabels } = useAppsMode();
const { palette, setPalette } = useAppPalette();

const labelsToggleVisible = computed(
	() => storedRailPosition.value === 'top' || storedRailPosition.value === 'bottom',
);

const positionOptions: Array<{ id: RailPosition; label: string; icon: string; hint: string }> = [
  { id: 'left', label: 'Left', icon: 'lucide:panel-left', hint: 'Vertical column on the left' },
  { id: 'right', label: 'Right', icon: 'lucide:panel-right', hint: 'Vertical column on the right' },
  { id: 'top', label: 'Top', icon: 'lucide:panel-top', hint: 'Horizontal strip below the header' },
  { id: 'bottom', label: 'Bottom', icon: 'lucide:panel-bottom', hint: 'Horizontal strip pinned to the bottom' },
  { id: 'floating', label: 'Floating', icon: 'lucide:focus', hint: 'Bottom-center pill that stays out of the way' },
];

const isMobileForced = computed(() => railPosition.value === 'bottom' && storedRailPosition.value !== 'bottom');
const open = ref(false);
const saving = ref(false);

async function handlePickPosition(next: RailPosition) {
  if (storedRailPosition.value === next) return;
  saving.value = true;
  try {
    await setRailPosition(next);
  } catch {
    // surface gracefully — popover stays open so user can retry
  } finally {
    saving.value = false;
  }
}

/** Build a swatch row for each palette so users see what they'll get.
 *  Reads through `getAppAccents` (the derived view of the palette's
 *  `sourceColors` + `pickGappy`) so swatches always match the rail. */
function swatchesFor(id: AppPaletteId) {
  const accents = getAppAccents(id);
  return [...APP_ORDER, ...APP_FOOTER_ORDER].map((appId) => {
    const c = accents[appId];
    return `hsl(${c.h} ${c.s}% ${c.l}%)`;
  });
}

async function handlePickPalette(next: AppPaletteId) {
  if (palette.value === next) return;
  saving.value = true;
  try {
    await setPalette(next);
  } catch {
    // surface gracefully — popover stays open so user can retry
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
        title="Rail settings"
        aria-label="Open rail settings"
      >
        <Icon name="lucide:layout-grid" class="size-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-72 p-1.5 max-h-[80vh] overflow-y-auto" align="end">
      <!-- ── Section: Position ─────────────────────────────────────── -->
      <div class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Rail Position
      </div>
      <div class="space-y-0.5">
        <button
          v-for="opt in positionOptions"
          :key="opt.id"
          type="button"
          :disabled="saving"
          class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
          :class="{ 'bg-primary/10 text-primary': storedRailPosition === opt.id }"
          @click="handlePickPosition(opt.id)"
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

      <!-- ── Section: Show labels (top/bottom only) ────────────────── -->
      <div
        v-if="labelsToggleVisible"
        class="mt-1.5 px-2 py-1.5 flex items-center gap-2.5 rounded-md hover:bg-muted/60 cursor-pointer"
        @click="setRailShowLabels(!railShowLabels)"
      >
        <Icon name="lucide:case-sensitive" class="size-4 shrink-0 text-muted-foreground" />
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium leading-tight">Show app names</div>
          <div class="text-[10px] text-muted-foreground leading-tight">
            Labels appear next to each icon (lg screens and up).
          </div>
        </div>
        <Switch
          :model-value="railShowLabels"
          class="shrink-0"
          @update:model-value="setRailShowLabels"
          @click.stop
        />
      </div>

      <!-- ── Section: Palette ──────────────────────────────────────── -->
      <!-- Hidden while we lock the apps shell to the Sea Mist palette.
           Re-show when APP_PALETTE_IDS exposes more than one entry. -->
      <template v-if="APP_PALETTE_IDS.length > 1">
        <div class="mt-1.5 mb-0.5 mx-2 border-t border-border/40" aria-hidden="true" />
        <div class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          App Palette
        </div>
        <div class="space-y-0.5">
          <button
            v-for="id in APP_PALETTE_IDS"
            :key="id"
            type="button"
            :disabled="saving"
            class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
            :class="{ 'bg-primary/10 text-primary': palette === id }"
            @click="handlePickPalette(id)"
          >
            <div class="flex-1 min-w-0">
              <div class="text-xs font-medium leading-tight mb-1">{{ APP_PALETTES[id].meta.label }}</div>
              <div class="flex items-center gap-0.5 mb-1" aria-hidden="true">
                <span
                  v-for="(swatch, idx) in swatchesFor(id)"
                  :key="idx"
                  class="block w-3.5 h-3.5 rounded-sm shrink-0"
                  :style="{ backgroundColor: swatch }"
                />
              </div>
              <div class="text-[10px] text-muted-foreground leading-tight truncate">{{ APP_PALETTES[id].meta.hint }}</div>
            </div>
            <Icon
              v-if="palette === id"
              name="lucide:check"
              class="size-3.5 text-primary shrink-0"
            />
          </button>
        </div>
      </template>

    </PopoverContent>
  </Popover>
</template>
