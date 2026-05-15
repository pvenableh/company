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
const { palette, setPalette, glassChrome, setGlassChrome } = useAppPalette();

// Keyed off the *rendered* position rather than the stored choice, so a
// user whose stored pref is `floating` (forcibly switched to bottom on
// narrow screens by `useAppsMode`) still gets the labels toggle. Without
// this the bottom-forced rail shows labels with no way to hide them.
const labelsToggleVisible = computed(
	() => railPosition.value === 'top' || railPosition.value === 'bottom',
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
 *  `sourceColors` + `pickGappy`) so swatches always match the rail.
 *  The bg picks double as the chromatic icon colours under both Neutral
 *  (iconStrategy: 'identity') and the Glass toggle, so a single swatch
 *  row is accurate for every palette regardless of chip-mode. */
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
        class="mt-1.5 px-2 py-1.5 rounded-md bg-warning/10 text-[10px] text-warning dark:text-warning leading-snug"
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

      <!-- ── Section: Glass chrome toggle ──────────────────────────── -->
      <!-- Orthogonal to palette: forces every chip + primary button onto
           a frosted-grey surface and lets the palette accent drive icons
           + button labels. Reads as a calmer, more uniform aesthetic. -->
      <div class="mt-1.5 mb-0.5 mx-2 border-t border-border/40" aria-hidden="true" />
      <div
        class="px-2 py-1.5 flex items-center gap-2.5 rounded-md hover:bg-muted/60 cursor-pointer"
        @click="setGlassChrome(!glassChrome)"
      >
        <Icon name="lucide:sparkles" class="size-4 shrink-0 text-muted-foreground" />
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium leading-tight">Glass chrome</div>
          <div class="text-[10px] text-muted-foreground leading-tight">
            Frosted chips + buttons; icons wear the palette's chromatic ramp.
          </div>
        </div>
        <Switch
          :model-value="glassChrome"
          class="shrink-0"
          @update:model-value="setGlassChrome"
          @click.stop
        />
      </div>

      <!-- ── Section: Palette ──────────────────────────────────────── -->
      <!-- 3 palettes rendered side-by-side. Each tile shows a label + a
           row of skinny vertical bars representing pickGappy's spread
           across the palette source — the same colours the rail chip
           icons will wear under Neutral / Glass mode. Hint moved to
           `title=` so it surfaces on hover without taking row space. -->
      <template v-if="APP_PALETTE_IDS.length > 1">
        <div class="mt-1.5 mb-0.5 mx-2 border-t border-border/40" aria-hidden="true" />
        <div class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          App Palette
        </div>
        <div class="flex gap-1 px-1.5 pb-1">
          <button
            v-for="id in APP_PALETTE_IDS"
            :key="id"
            type="button"
            :disabled="saving"
            :title="APP_PALETTES[id].meta.hint"
            class="flex-1 flex flex-col items-center gap-1.5 px-1.5 py-2 transition-colors hover:bg-muted/60 disabled:opacity-60"
            :class="{ 'bg-muted': palette === id }"
            style="border-radius: 3px;"
            @click="handlePickPalette(id)"
          >
            <span class="text-[10px] font-medium leading-tight">{{ APP_PALETTES[id].meta.label }}</span>
            <span class="flex items-center gap-px h-7" aria-hidden="true">
              <span
                v-for="(swatch, idx) in swatchesFor(id)"
                :key="idx"
                class="block w-[3px] h-full rounded-[1px] shrink-0"
                :style="{ backgroundColor: swatch }"
              />
            </span>
          </button>
        </div>
      </template>

    </PopoverContent>
  </Popover>
</template>
