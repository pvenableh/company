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
import { useAppPalette, type AppPaletteId } from '~/composables/useAppPalette';
import {
  APP_PALETTES,
  APP_PALETTE_IDS,
  APP_ORDER,
  APP_FOOTER_ORDER,
  getAppAccents,
  getPaletteChrome,
} from '~/composables/useAppAccent';

const props = withDefaults(
  // `showSidebarToggle` is false in the client portal — the desktop sidebar is
  // a staff-app affordance (it swaps the AppSidebar for the dock); the portal
  // uses PortalRail, so the toggle would be a dead switch there.
  defineProps<{ density?: 'compact' | 'comfortable'; showSidebarToggle?: boolean }>(),
  { density: 'comfortable', showSidebarToggle: true },
);

const { railShowLabels, setRailShowLabels, desktopSidebar, setDesktopSidebar } = useAppsMode();
const { palette, setPalette, glassChrome, setGlassChrome, paletteTint, setPaletteTint } = useAppPalette();

// Glass chrome's visible payoff is flipping gradient chips → frosted. Both
// picker palettes (Default, Mono) are already frosted (`chipMode:'neutral'`),
// so the toggle is a no-op for them — hide it rather than ship a dead switch.
// It reappears automatically if a gradient-chip palette (Fresh/Aurora revival,
// future Brand Light) becomes active, and stays visible while ON so anyone
// who enabled it earlier can still turn it off.
const glassToggleVisible = computed(
  () => glassChrome.value || getPaletteChrome(palette.value).chipMode === 'palette',
);

// The palette is a PERSONAL choice (2026-07-15, monetization rung 1) — every
// member gets the picker; writes land on their own user row. The locked
// "Your Brand" swatch below it is the Brand Light upsell probe: it renders
// the org's real brand color and logs a willingness-to-pay signal on click.
const { currentOrg } = useOrganization();
const toast = useToast();
const brandColor = computed(() => (currentOrg.value as any)?.brand_color || '#5390d9');
const brandNoted = ref(false);
function handleBrandInterest() {
  if (!brandNoted.value) {
    brandNoted.value = true;
    $fetch('/api/telemetry/upsell', {
      method: 'POST',
      body: {
        feature: 'brand_light',
        source: 'rail-settings',
        organization: (currentOrg.value as any)?.id ?? null,
      },
    }).catch(() => {});
  }
  toast.info('Brand Light is coming — your interest is noted.');
}

// The rail is locked to the bottom (the position picker has been retired), so
// the label toggle — which only applies to a horizontal rail — is always shown.
const labelsToggleVisible = true;

const saving = ref(false);

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
    <!-- ── Section: Desktop sidebar ──────────────────────────────── -->
    <template v-if="showSidebarToggle">
      <div class="rail-panel__toggle" @click="setDesktopSidebar(!desktopSidebar)">
        <Icon name="lucide:panel-left" class="rail-panel__toggle-icon" />
        <div class="rail-panel__toggle-body">
          <div class="rail-panel__toggle-title">Desktop sidebar</div>
          <div class="rail-panel__toggle-hint">Show a labeled navigation sidebar on large screens (replaces the bottom app dock).</div>
        </div>
        <Switch
          :model-value="desktopSidebar"
          class="shrink-0"
          @update:model-value="setDesktopSidebar"
          @click.stop
        />
      </div>
      <div class="rail-panel__divider" aria-hidden="true" />
    </template>

    <!-- ── Section: Show labels ──────────────────────────────────── -->
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

    <!-- ── Section: Glass chrome (only when the active palette has
         gradient chips to frost — hidden while both picker palettes
         are already chipMode-neutral) ────────────────────────────── -->
    <div class="rail-panel__divider" aria-hidden="true" />
    <template v-if="glassToggleVisible">
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
    </template>

    <!-- ── Section: Palette tint ─────────────────────────────────── -->
    <div class="rail-panel__toggle" @click="setPaletteTint(!paletteTint)">
      <Icon name="lucide:droplets" class="rail-panel__toggle-icon" />
      <div class="rail-panel__toggle-body">
        <div class="rail-panel__toggle-title">Palette tint</div>
        <div class="rail-panel__toggle-hint">Wash the rail and floating dock in a gradient sampled from the palette — especially rich in dark mode.</div>
      </div>
      <Switch
        :model-value="paletteTint"
        class="shrink-0"
        @update:model-value="setPaletteTint"
        @click.stop
      />
    </div>

    <!-- ── Section: Palette (personal — every member) ──────────────── -->
    <template v-if="APP_PALETTE_IDS.length > 1">
      <div class="rail-panel__divider" aria-hidden="true" />
      <div class="rail-panel__heading">Palette</div>
      <div class="rail-panel__hint">Yours alone — pick what you like. Client-facing pages keep your org's brand.</div>
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
        <!-- Brand Light upsell probe — locked swatch in the org's own color -->
        <button
          type="button"
          class="rail-panel__palette rail-panel__palette--locked"
          title="Pour your brand color through the glass — coming soon"
          @click="handleBrandInterest"
        >
          <span class="rail-panel__palette-label">
            Your Brand
            <EIcon name="lucide:lock" class="rail-panel__lock" aria-hidden="true" />
          </span>
          <span class="rail-panel__palette-swatches" aria-hidden="true">
            <span
              v-for="i in 7"
              :key="i"
              class="rail-panel__palette-swatch"
              :style="{ backgroundColor: brandColor, opacity: 0.2 + i * 0.11 }"
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
.rail-panel__hint { @apply text-[11px] text-muted-foreground px-2 pb-2 -mt-1 leading-snug; }
.rail-panel--compact .rail-panel__hint { @apply text-[10px]; }

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

/* Brand Light upsell probe — dashed "locked" affordance */
.rail-panel__palette--locked { @apply text-muted-foreground; }
.rail-panel--comfortable .rail-panel__palette--locked { border-style: dashed; }
.rail-panel__palette--locked:hover { @apply text-foreground; }
.rail-panel__lock { width: 10px; height: 10px; opacity: 0.7; display: inline-block; vertical-align: -1px; margin-left: 2px; }
</style>
