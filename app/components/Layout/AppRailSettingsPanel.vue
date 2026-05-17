<script setup lang="ts">
/**
 * AppRailSettingsPanel — the four-section content shared by:
 *   - `AppRailPositionPicker` (popover trigger in the app/portal chrome)
 *   - `/portal/account` Appearance tab (full-page section)
 *
 * Sections: Position, Show labels, Glass chrome, App palette. Same
 * composables, same persistence — `useAppsMode` + `useAppPalette`.
 *
 * Pass `density="compact"` for the popover (tight 10px/xs sizing) or
 * leave default `density="comfortable"` for inline page use (larger
 * tap targets + more whitespace).
 */
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

const props = withDefaults(
  defineProps<{ density?: 'compact' | 'comfortable' }>(),
  { density: 'comfortable' },
);

const { railPosition, storedRailPosition, setRailPosition, railShowLabels, setRailShowLabels } = useAppsMode();
const { palette, setPalette, glassChrome, setGlassChrome } = useAppPalette();

const labelsToggleVisible = computed(
	() => railPosition.value === 'top' || railPosition.value === 'bottom',
);

const positionOptions: Array<{ id: RailPosition; label: string; icon: string; hint: string }> = [
  { id: 'left', label: 'Left', icon: 'lucide:panel-left', hint: 'Floating pill on the left edge' },
  { id: 'right', label: 'Right', icon: 'lucide:panel-right', hint: 'Floating pill on the right edge' },
  { id: 'top', label: 'Top', icon: 'lucide:panel-top', hint: 'Floating pill along the top' },
  { id: 'bottom', label: 'Bottom', icon: 'lucide:panel-bottom', hint: 'Floating pill along the bottom' },
];

const isMobileForced = computed(() => railPosition.value === 'bottom' && storedRailPosition.value !== 'bottom');
const saving = ref(false);

async function handlePickPosition(next: RailPosition) {
  if (storedRailPosition.value === next) return;
  saving.value = true;
  try {
    await setRailPosition(next);
  } catch {
    // swallow — caller UI surfaces the unchanged state
  } finally {
    saving.value = false;
  }
}

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
    // swallow
  } finally {
    saving.value = false;
  }
}

const isCompact = computed(() => props.density === 'compact');
</script>

<template>
  <div :class="isCompact ? 'rail-panel rail-panel--compact' : 'rail-panel rail-panel--comfortable'">
    <!-- ── Section: Position ─────────────────────────────────────── -->
    <div class="rail-panel__heading">Rail position</div>
    <div class="rail-panel__list">
      <button
        v-for="opt in positionOptions"
        :key="opt.id"
        type="button"
        :disabled="saving"
        class="rail-panel__row"
        :class="{ 'rail-panel__row--active': storedRailPosition === opt.id }"
        @click="handlePickPosition(opt.id)"
      >
        <Icon :name="opt.icon" class="rail-panel__row-icon" />
        <div class="rail-panel__row-body">
          <div class="rail-panel__row-title">{{ opt.label }}</div>
          <div class="rail-panel__row-hint">{{ opt.hint }}</div>
        </div>
        <Icon
          v-if="storedRailPosition === opt.id"
          name="lucide:check"
          class="rail-panel__row-check"
        />
      </button>
    </div>
    <div v-if="isMobileForced" class="rail-panel__warning">
      Mobile forces Bottom. Your saved choice ({{ storedRailPosition }}) returns on wider screens.
    </div>

    <!-- ── Section: Show labels (top/bottom only) ────────────────── -->
    <div
      v-if="labelsToggleVisible"
      class="rail-panel__toggle"
      @click="setRailShowLabels(!railShowLabels)"
    >
      <Icon name="lucide:case-sensitive" class="rail-panel__toggle-icon" />
      <div class="rail-panel__toggle-body">
        <div class="rail-panel__toggle-title">Show app names</div>
        <div class="rail-panel__toggle-hint">Labels appear next to each icon (lg screens and up).</div>
      </div>
      <Switch
        :model-value="railShowLabels"
        class="shrink-0"
        @update:model-value="setRailShowLabels"
        @click.stop
      />
    </div>

    <!-- ── Section: Glass chrome ─────────────────────────────────── -->
    <div class="rail-panel__divider" aria-hidden="true" />
    <div class="rail-panel__toggle" @click="setGlassChrome(!glassChrome)">
      <Icon name="lucide:gem" class="rail-panel__toggle-icon" />
      <div class="rail-panel__toggle-body">
        <div class="rail-panel__toggle-title">Glass chrome</div>
        <div class="rail-panel__toggle-hint">Frosted chips + buttons; icons wear the palette's chromatic ramp.</div>
      </div>
      <Switch
        :model-value="glassChrome"
        class="shrink-0"
        @update:model-value="setGlassChrome"
        @click.stop
      />
    </div>

    <!-- ── Section: Palette ──────────────────────────────────────── -->
    <template v-if="APP_PALETTE_IDS.length > 1">
      <div class="rail-panel__divider" aria-hidden="true" />
      <div class="rail-panel__heading">App palette</div>
      <div class="rail-panel__palettes">
        <button
          v-for="id in APP_PALETTE_IDS"
          :key="id"
          type="button"
          :disabled="saving"
          :title="APP_PALETTES[id].meta.hint"
          class="rail-panel__palette"
          :class="{ 'rail-panel__palette--active': palette === id }"
          @click="handlePickPalette(id)"
        >
          <span class="rail-panel__palette-label">{{ APP_PALETTES[id].meta.label }}</span>
          <span class="rail-panel__palette-swatches" aria-hidden="true">
            <span
              v-for="(swatch, idx) in swatchesFor(id)"
              :key="idx"
              class="rail-panel__palette-swatch"
              :style="{ backgroundColor: swatch }"
            />
          </span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.rail-panel { @apply flex flex-col; }

.rail-panel__heading {
  @apply font-semibold uppercase tracking-wider text-muted-foreground;
}
.rail-panel--compact .rail-panel__heading { @apply text-[10px] px-2 py-1.5; }
.rail-panel--comfortable .rail-panel__heading { @apply text-[11px] pt-1 pb-2.5; }

.rail-panel__list { @apply flex flex-col; }
.rail-panel--compact .rail-panel__list { gap: 2px; }
.rail-panel--comfortable .rail-panel__list { gap: 4px; }

.rail-panel__row {
  @apply flex w-full items-center gap-2.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-60;
  border-radius: 6px;
}
.rail-panel--compact .rail-panel__row { @apply px-2 py-1.5; }
.rail-panel--comfortable .rail-panel__row { @apply px-3 py-2.5; }

.rail-panel__row--active {
  @apply bg-primary/10 text-primary;
}

.rail-panel__row-icon { @apply size-4 shrink-0; }
.rail-panel__row-body { @apply flex-1 min-w-0; }

.rail-panel__row-title { @apply font-medium leading-tight; }
.rail-panel--compact .rail-panel__row-title { @apply text-xs; }
.rail-panel--comfortable .rail-panel__row-title { @apply text-sm; }

.rail-panel__row-hint { @apply text-muted-foreground leading-tight truncate; }
.rail-panel--compact .rail-panel__row-hint { @apply text-[10px]; }
.rail-panel--comfortable .rail-panel__row-hint { @apply text-xs; }

.rail-panel__row-check { @apply size-3.5 text-primary shrink-0; }

.rail-panel__warning {
  @apply rounded-md bg-warning/10 text-warning dark:text-warning leading-snug;
}
.rail-panel--compact .rail-panel__warning { @apply mt-1.5 px-2 py-1.5 text-[10px]; }
.rail-panel--comfortable .rail-panel__warning { @apply mt-2 px-3 py-2 text-xs; }

.rail-panel__toggle {
  @apply flex items-center gap-2.5 hover:bg-muted/60 cursor-pointer transition-colors;
  border-radius: 6px;
}
.rail-panel--compact .rail-panel__toggle { @apply mt-1.5 px-2 py-1.5; }
.rail-panel--comfortable .rail-panel__toggle { @apply mt-1 px-3 py-2.5; }

.rail-panel__toggle-icon { @apply size-4 shrink-0 text-muted-foreground; }
.rail-panel__toggle-body { @apply flex-1 min-w-0; }
.rail-panel__toggle-title { @apply font-medium leading-tight; }
.rail-panel--compact .rail-panel__toggle-title { @apply text-xs; }
.rail-panel--comfortable .rail-panel__toggle-title { @apply text-sm; }

.rail-panel__toggle-hint { @apply text-muted-foreground leading-tight; }
.rail-panel--compact .rail-panel__toggle-hint { @apply text-[10px]; }
.rail-panel--comfortable .rail-panel__toggle-hint { @apply text-xs; }

.rail-panel__divider { @apply border-t border-border/40; }
.rail-panel--compact .rail-panel__divider { @apply mt-1.5 mb-0.5 mx-2; }
.rail-panel--comfortable .rail-panel__divider { @apply my-3; }

.rail-panel__palettes { @apply flex gap-1.5; }
.rail-panel--compact .rail-panel__palettes { @apply px-1.5 pb-1 gap-1; }

.rail-panel__palette {
  @apply flex-1 flex flex-col items-center gap-1.5 transition-colors hover:bg-muted/60 disabled:opacity-60;
  border-radius: 6px;
}
.rail-panel--compact .rail-panel__palette { @apply px-1.5 py-2; }
.rail-panel--comfortable .rail-panel__palette { @apply px-2 py-3; border: 1px solid hsl(var(--border) / 0.4); }

.rail-panel__palette--active { @apply bg-muted; }
.rail-panel--comfortable .rail-panel__palette--active { border-color: hsl(var(--primary) / 0.6); }

.rail-panel__palette-label { @apply font-medium leading-tight; }
.rail-panel--compact .rail-panel__palette-label { @apply text-[10px]; }
.rail-panel--comfortable .rail-panel__palette-label { @apply text-xs; }

.rail-panel__palette-swatches { @apply flex items-center gap-px; }
.rail-panel--compact .rail-panel__palette-swatches { height: 28px; }
.rail-panel--comfortable .rail-panel__palette-swatches { height: 40px; }

.rail-panel__palette-swatch {
  @apply block h-full shrink-0;
  width: 3px;
  border-radius: 1px;
}
.rail-panel--comfortable .rail-panel__palette-swatch { width: 4px; }
</style>
