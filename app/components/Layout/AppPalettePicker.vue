<script setup lang="ts">
/**
 * AppPalettePicker — apps-shell chrome popover for the per-user palette.
 *
 * Three palettes ship today (default | oceanic | royal); the picker shows
 * a row of swatches per palette so the user can preview the rail's hues
 * before committing. Persists via `useAppPalette().setPalette` →
 * `directus_users.app_palette`. Live-syncs to the rail without a reload.
 */
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAppPalette, type AppPaletteId } from '~/composables/useAppPalette';
import { APP_PALETTES, APP_ORDER, APP_FOOTER_ORDER } from '~/composables/useAppAccent';

const { palette, setPalette } = useAppPalette();

const options: Array<{ id: AppPaletteId; label: string; hint: string }> = [
  { id: 'default', label: 'Default', hint: 'Original Earnest hues — distinct per app' },
  { id: 'oceanic', label: 'Oceanic', hint: 'Lime through deep Yale blue' },
  { id: 'royal',   label: 'Royal',   hint: 'Indigo-violet gradient' },
];

/** Build a swatch row for each palette so users see what they'll get. */
function swatchesFor(id: AppPaletteId) {
  const p = APP_PALETTES[id];
  return [...APP_ORDER, ...APP_FOOTER_ORDER].map((appId) => {
    const c = p[appId];
    return `hsl(${c.h} ${c.s}% ${c.l}%)`;
  });
}

const open = ref(false);
const saving = ref(false);

async function handlePick(next: AppPaletteId) {
  if (palette.value === next) {
    open.value = false;
    return;
  }
  saving.value = true;
  try {
    await setPalette(next);
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
        :title="`Palette: ${palette}`"
        aria-label="Choose app palette"
      >
        <Icon name="lucide:palette" class="size-4" />
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-72 p-1.5" align="end">
      <div class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        App Palette
      </div>
      <div class="space-y-0.5">
        <button
          v-for="opt in options"
          :key="opt.id"
          type="button"
          :disabled="saving"
          class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
          :class="{ 'bg-primary/10 text-primary': palette === opt.id }"
          @click="handlePick(opt.id)"
        >
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium leading-tight mb-1">{{ opt.label }}</div>
            <div class="flex items-center gap-0.5 mb-1" aria-hidden="true">
              <span
                v-for="(swatch, idx) in swatchesFor(opt.id)"
                :key="idx"
                class="block w-3.5 h-3.5 rounded-sm shrink-0"
                :style="{ backgroundColor: swatch }"
              />
            </div>
            <div class="text-[10px] text-muted-foreground leading-tight truncate">{{ opt.hint }}</div>
          </div>
          <Icon
            v-if="palette === opt.id"
            name="lucide:check"
            class="size-3.5 text-primary shrink-0"
          />
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
