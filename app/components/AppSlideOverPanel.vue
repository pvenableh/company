<!--
  AppSlideOverPanel — reusable layout shell for content that lives inside an
  `AppSlideOver` (or in a standalone page that wants the same shape).

  Three slots:
    - `#header` — sticky to the top of the scroll area (e.g. a floor strip)
    - default  — scrolling body content
    - `#footer` — sticky to the bottom of the scroll area (e.g. a save bar)

  Sticky positioning here is intentional: in a slide-over the closest
  scrolling ancestor is `AppSlideOver`'s body, so the header/footer dock
  to the slide-over panel; in a page they dock to the viewport. Either
  way the content scrolls behind them.

  The `padded` prop (default `true`) adds the same horizontal+vertical
  inset that floor pages use, so callers can drop the panel into a slot
  without re-creating padding. Set `:padded="false"` for full-bleed
  callers (e.g. when the parent already provides padding).
-->
<script setup>
const props = defineProps({
	padded: { type: Boolean, default: true },
	/** Optional explicit max-width for the body content. Defaults to `none`
	 *  so the panel adopts its parent's width — set this when you want a
	 *  narrow centred form regardless of container. */
	maxWidth: { type: String, default: null },
});
</script>

<template>
	<div class="app-slide-over-panel" :class="{ 'app-slide-over-panel--padded': padded }">
		<div v-if="$slots.header" class="app-slide-over-panel__header">
			<div class="app-slide-over-panel__header-inner" :style="maxWidth ? { maxWidth } : null">
				<slot name="header" />
			</div>
		</div>

		<div class="app-slide-over-panel__body">
			<div class="app-slide-over-panel__body-inner" :style="maxWidth ? { maxWidth } : null">
				<slot />
			</div>
		</div>

		<div v-if="$slots.footer" class="app-slide-over-panel__footer">
			<div class="app-slide-over-panel__footer-inner" :style="maxWidth ? { maxWidth } : null">
				<slot name="footer" />
			</div>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-slide-over-panel {
	display: flex;
	flex-direction: column;
	min-height: 100%;
	width: 100%;
}

/* All three regions get the same horizontal inset so cards/forms don't sit
 * flush against the slide-over edge. Vertical padding is slightly larger on
 * the body so form sections have room to breathe between the floor strip
 * and the save button. `--app-panel-px` exists so future callers can
 * override the inset without rewriting the rules. */
.app-slide-over-panel {
	--app-panel-px: 20px;
}

.app-slide-over-panel--padded {
	--app-panel-px: 24px;
}

/* Sticky header — pins to the top of the scrolling ancestor. The frosted
 * bg lets scrolled content show through faintly so the surface feels
 * connected to the page, not a hard cut. */
.app-slide-over-panel__header {
	position: sticky;
	top: 0;
	z-index: 10;
	background: hsl(var(--background) / 0.92);
	backdrop-filter: blur(8px);
	border-bottom: 1px solid hsl(var(--border) / 0.3);
}

.app-slide-over-panel__header-inner {
	width: 100%;
	margin: 0 auto;
	padding: 12px var(--app-panel-px);
}

.app-slide-over-panel__body {
	flex: 1 1 auto;
	min-height: 0;
}

.app-slide-over-panel__body-inner {
	width: 100%;
	margin: 0 auto;
	padding: 20px var(--app-panel-px);
}

/* Sticky footer — pins to the bottom of the scrolling ancestor. Same
 * frost as the header so scrolled content reads through softly. */
.app-slide-over-panel__footer {
	position: sticky;
	bottom: 0;
	z-index: 10;
	background: hsl(var(--background) / 0.92);
	backdrop-filter: blur(12px);
	border-top: 1px solid hsl(var(--border) / 0.3);
}

.app-slide-over-panel__footer-inner {
	width: 100%;
	margin: 0 auto;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 10px var(--app-panel-px);
}
</style>
