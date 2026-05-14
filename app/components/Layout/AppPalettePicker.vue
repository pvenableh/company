<script setup lang="ts">
/**
 * AppPalettePicker — apps-shell chrome popover for the per-user palette.
 *
 * The available palettes (id + label + hint + colours) come from
 * `APP_PALETTES` in `useAppAccent.ts` — adding a new palette is a single
 * map entry there, and this picker plus `useAppPalette` pick it up
 * automatically.
 *
 * Persists via `useAppPalette().setPalette` → `directus_users.app_palette`.
 * Live-syncs to the rail without a reload.
 */
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useAppPalette, type AppPaletteId } from '~/composables/useAppPalette';
import { APP_PALETTES, APP_PALETTE_IDS, APP_ORDER, APP_FOOTER_ORDER } from '~/composables/useAppAccent';

const { palette, setPalette } = useAppPalette();

/** Build a swatch row for each palette so users see what they'll get. */
function swatchesFor(id: AppPaletteId) {
  const colors = APP_PALETTES[id].colors;
  return [...APP_ORDER, ...APP_FOOTER_ORDER].map((appId) => {
    const c = colors[appId];
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
        :title="`Palette: ${APP_PALETTES[palette].meta.label}`"
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
          v-for="id in APP_PALETTE_IDS"
          :key="id"
          type="button"
          :disabled="saving"
          class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
          :class="{ 'bg-primary/10 text-primary': palette === id }"
          @click="handlePick(id)"
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
    </PopoverContent>
  </Popover>
</template>
