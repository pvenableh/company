<template>
	<div class="theme-switcher">
		<!-- ── Color scheme ───────────────────────────────────────── -->
		<section class="theme-switcher__section">
			<header class="theme-switcher__header">
				<h3 class="theme-switcher__title">Color scheme</h3>
				<p class="theme-switcher__subtitle">Sets the surface tone across Earnest — light, warm paper, or a custom accent.</p>
			</header>

			<div class="theme-switcher__grid theme-switcher__grid--swatch">
				<button
					v-for="theme in visibleThemes"
					:key="theme.id"
					type="button"
					class="swatch-card"
					:class="{ 'swatch-card--active': currentTheme === theme.id }"
					@click="handleThemeClick(theme.id)"
				>
					<span
						class="swatch-card__paint"
						:style="{ background: `linear-gradient(135deg, ${theme.swatches[0]}, ${theme.swatches[2] || theme.swatches[1]})` }"
					>
						<span v-if="currentTheme === theme.id" class="swatch-card__check">
							<Icon name="lucide:check" class="size-3" />
						</span>
					</span>
					<span class="swatch-card__label">
						<span class="swatch-card__name">{{ theme.name }}</span>
						<span class="swatch-card__hint">{{ theme.description }}</span>
					</span>
				</button>
			</div>

			<!-- Custom color (mono/chromatic + hue picker) is hidden by default —
			     legacy power-user surface. Pass `:show-custom-color` to bring it
			     back, e.g. for a settings deep-dive. -->
			<button
				v-if="showCustomColor"
				type="button"
				class="theme-switcher__disclosure"
				@click="showAdvancedColors = !showAdvancedColors"
			>
				<Icon
					:name="showAdvancedColors ? 'lucide:chevron-down' : 'lucide:chevron-right'"
					class="size-3.5"
				/>
				Custom accent color
			</button>

			<transition name="slide">
				<div v-if="showCustomColor && showAdvancedColors" class="theme-switcher__advanced">
					<div class="theme-switcher__grid theme-switcher__grid--swatch">
						<button
							v-for="theme in customThemes"
							:key="theme.id"
							type="button"
							class="swatch-card"
							:class="{ 'swatch-card--active': currentTheme === theme.id }"
							@click="handleThemeClick(theme.id)"
						>
							<span
								v-if="theme.id === 'mono'"
								class="swatch-card__paint"
								:style="{ background: `linear-gradient(135deg, hsl(${monoHue}, 55%, 65%), hsl(${monoHue}, 55%, 35%))` }"
							>
								<span v-if="currentTheme === theme.id" class="swatch-card__check">
									<Icon name="lucide:check" class="size-3" />
								</span>
							</span>
							<span
								v-else
								class="swatch-card__paint"
								:style="{ background: `linear-gradient(135deg, hsl(${monoHue}, 65%, 50%), hsl(${(monoHue + 150) % 360}, 55%, 50%), hsl(${(monoHue + 30) % 360}, 50%, 55%))` }"
							>
								<span v-if="currentTheme === theme.id" class="swatch-card__check">
									<Icon name="lucide:check" class="size-3" />
								</span>
							</span>
							<span class="swatch-card__label">
								<span class="swatch-card__name">{{ theme.name }}</span>
							</span>
						</button>
					</div>

					<transition name="slide">
						<div
							v-if="currentTheme === 'mono' || currentTheme === 'chromatic'"
							class="hue-picker"
						>
							<div class="hue-picker__row">
								<span class="hue-picker__label">Hue</span>
								<span class="hue-picker__value">{{ monoHue }}°</span>
							</div>
							<div class="hue-picker__track">
								<div class="hue-gradient" />
								<input
									type="range"
									:value="monoHue"
									min="0"
									max="359"
									step="1"
									class="hue-picker__input"
									@input="setMonoHue(Number(($event.target as HTMLInputElement).value))"
								/>
								<div
									class="hue-picker__thumb"
									:style="{
										left: `calc(${(monoHue / 359) * 100}% - 10px)`,
										backgroundColor: `hsl(${monoHue}, 55%, 50%)`,
									}"
								/>
							</div>
							<div class="hue-picker__presets">
								<button
									v-for="preset in monoPresets"
									:key="preset.hue"
									type="button"
									class="hue-picker__preset"
									:class="{ 'hue-picker__preset--active': monoHue === preset.hue }"
									@click="setMonoHue(preset.hue)"
								>
									<span class="hue-picker__dot" :style="{ backgroundColor: preset.color }" />
									<span class="hue-picker__name">{{ preset.name }}</span>
								</button>
							</div>
						</div>
					</transition>
				</div>
			</transition>
		</section>

		<!-- ── Typography ─────────────────────────────────────────── -->
		<section class="theme-switcher__section">
			<header class="theme-switcher__header">
				<h3 class="theme-switcher__title">Typography</h3>
				<p class="theme-switcher__subtitle">The face Earnest wears when it speaks.</p>
			</header>

			<div class="theme-switcher__type-list">
				<button
					v-for="style in styles"
					:key="style.id"
					type="button"
					class="type-card"
					:class="{ 'type-card--active': currentStyle === style.id }"
					@click="setStyle(style.id)"
				>
					<span class="type-card__sample" :class="getStylePreviewClass(style.id)">Aa</span>
					<span class="type-card__body">
						<span class="type-card__name">{{ style.name }}</span>
						<span class="type-card__hint">{{ style.description }}</span>
					</span>
					<span v-if="currentStyle === style.id" class="type-card__check" aria-hidden="true">
						<Icon name="lucide:check" class="size-3" />
					</span>
				</button>
			</div>
		</section>

		<!-- ── Timeline icons (hidden by default) ─────────────────── -->
		<section v-if="showTimeline" class="theme-switcher__section">
			<header class="theme-switcher__header">
				<h3 class="theme-switcher__title">Timeline icons</h3>
				<p class="theme-switcher__subtitle">Pick the icon set for your activity timeline cards.</p>
			</header>

			<div class="theme-switcher__grid theme-switcher__grid--timeline">
				<button
					v-for="theme in timelineThemes"
					:key="theme.id"
					type="button"
					class="theme-card theme-card--timeline"
					:class="{ 'theme-card--active': currentTimelineThemeId === theme.id }"
					@click="setTimelineTheme(theme.id)"
				>
					<span class="theme-card__icons">
						<Icon
							v-for="(icon, idx) in getThemePreviewIcons(theme)"
							:key="idx"
							:name="icon"
							class="size-4"
						/>
					</span>
					<span class="theme-card__name">{{ theme.name }}</span>
					<span class="theme-card__hint">{{ theme.description }}</span>
					<span v-if="currentTimelineThemeId === theme.id" class="theme-card__check" aria-hidden="true">
						<Icon name="lucide:check" class="size-3" />
					</span>
				</button>
			</div>
		</section>
	</div>
</template>

<script setup lang="ts">
withDefaults(
	defineProps<{
		/** Show the Timeline Icons section. Hidden by default — surface this when the
		 * timeline iconography needs to be exposed (off for the Appearance pane today). */
		showTimeline?: boolean
		/** Show the custom-color (mono/chromatic) disclosure + hue picker. Hidden
		 * by default — legacy power-user surface. */
		showCustomColor?: boolean
	}>(),
	{ showTimeline: false, showCustomColor: false },
);

const { themes, styles, monoPresets, currentTheme, currentStyle, monoHue, setTheme, setStyle, setMonoHue } = useTheme();
const { themes: timelineThemes, currentThemeId: currentTimelineThemeId, setTheme: setTimelineTheme } = useTimelineTheme();

const showAdvancedColors = ref(false);

const CUSTOM_THEME_IDS = new Set(['mono', 'chromatic']);
const visibleThemes = computed(() => themes.filter((t) => !CUSTOM_THEME_IDS.has(t.id)));
const customThemes = computed(() => themes.filter((t) => CUSTOM_THEME_IDS.has(t.id)));

function getThemePreviewIcons(theme: typeof timelineThemes[0]): string[] {
	const keys = ['projects', 'tickets', 'invoices', 'tasks'];
	return keys.map((k) => theme.collectionIcons[k] || theme.preview);
}

const handleThemeClick = (themeId: string) => {
	setTheme(themeId);
};

function getStylePreviewClass(styleId: string): string {
	switch (styleId) {
		case 'modern': return 'font-sans font-bold tracking-tight';
		case 'classic': return 'font-serif font-semibold';
		case 'casual': return 'font-casual';
		case 'bold': return 'font-sans font-extrabold';
		default: return 'font-sans';
	}
}
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.theme-switcher {
	@apply grid gap-6 w-full;
}

.theme-switcher__section {
	@apply space-y-4;
}

.theme-switcher__header {
	@apply space-y-0.5;
}

.theme-switcher__title {
	@apply text-sm font-semibold text-foreground tracking-tight;
}

.theme-switcher__subtitle {
	@apply text-xs text-muted-foreground;
}

.theme-switcher__grid {
	@apply grid gap-3;
}

.theme-switcher__grid--mode {
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.theme-switcher__grid--swatch {
	/* Both scheme groups have exactly 2 items — fixed 2-up, capped width so
	   they fill nicely on mobile but don't balloon on wide screens (the 16:7
	   paint made 1fr cards huge before). */
	grid-template-columns: repeat(2, minmax(0, 1fr));
	max-width: 24rem;
}

.theme-switcher__grid--timeline {
	grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

/* ── Generic card (mode + timeline icons) ─────────────────────── */
.theme-card {
	@apply relative flex items-center gap-3 rounded-xl border border-border bg-card
		px-3.5 py-3 text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)];
}

.theme-card--timeline {
	@apply flex-col items-center text-center gap-1.5 px-3 py-4;
}

.theme-card:hover {
	@apply border-foreground/15 bg-muted/30 -translate-y-px shadow-sm;
}

.theme-card--active {
	@apply border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm;
}

.theme-card__icon {
	@apply flex items-center justify-center size-9 rounded-full bg-muted/60 text-foreground/80 shrink-0;
}

.theme-card__icons {
	@apply grid grid-cols-2 gap-1 mb-1;
}

.theme-card__body {
	@apply flex flex-col min-w-0;
}

.theme-card__name {
	@apply text-sm font-semibold text-foreground;
}

.theme-card__hint {
	@apply text-[11px] text-muted-foreground leading-tight mt-0.5;
}

.theme-card--timeline .theme-card__hint {
	@apply text-[10px];
}

.theme-card__check {
	@apply absolute top-2 right-2 flex items-center justify-center
		size-5 rounded-full bg-primary text-primary-foreground;
}

/* ── Swatch card ──────────────────────────────────────────────── */
.swatch-card {
	@apply relative flex flex-col rounded-xl overflow-hidden bg-card
		border border-border transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)];
}

.swatch-card:hover {
	@apply -translate-y-px shadow-md border-foreground/15;
}

.swatch-card--active {
	@apply border-primary ring-1 ring-primary/30 shadow-md;
}

.swatch-card__paint {
	@apply relative block aspect-[16/7];
}

.swatch-card__check {
	@apply absolute top-2 right-2 flex items-center justify-center
		size-5 rounded-full bg-background/90 text-foreground shadow;
}

.swatch-card__label {
	@apply px-3 py-2 flex flex-col leading-tight bg-card;
}

.swatch-card__name {
	@apply text-xs font-semibold text-foreground tracking-tight;
}

.swatch-card__hint {
	@apply text-[10px] text-muted-foreground mt-0.5;
}

/* ── Disclosure (custom color expander) ───────────────────────── */
.theme-switcher__disclosure {
	@apply inline-flex items-center gap-1.5 text-xs text-muted-foreground
		hover:text-foreground transition-colors mt-1;
}

.theme-switcher__advanced {
	@apply space-y-4;
}

/* ── Hue picker ───────────────────────────────────────────────── */
.hue-picker {
	@apply rounded-xl border border-border bg-card/60 p-4 space-y-3;
}

.hue-picker__row {
	@apply flex items-center justify-between;
}

.hue-picker__label {
	@apply text-xs font-medium text-foreground/80;
}

.hue-picker__value {
	@apply text-[11px] font-mono tabular-nums bg-muted px-1.5 py-0.5 rounded;
}

.hue-picker__track {
	@apply relative h-8 rounded-lg overflow-hidden shadow-inner;
}

.hue-gradient {
	@apply absolute inset-0 rounded-lg;
	background: linear-gradient(
		to right,
		hsl(0, 60%, 50%), hsl(30, 60%, 50%), hsl(60, 60%, 50%),
		hsl(90, 60%, 50%), hsl(120, 60%, 50%), hsl(150, 60%, 50%),
		hsl(180, 60%, 50%), hsl(210, 60%, 50%), hsl(240, 60%, 50%),
		hsl(270, 60%, 50%), hsl(300, 60%, 50%), hsl(330, 60%, 50%),
		hsl(359, 60%, 50%)
	);
}

.hue-picker__input {
	@apply absolute inset-0 w-full h-full opacity-0 cursor-pointer;
}

.hue-picker__thumb {
	@apply absolute top-1/2 -translate-y-1/2 size-5 rounded-full border-2 border-white shadow-lg pointer-events-none;
	transition: left 0.075s ease;
}

.hue-picker__presets {
	@apply grid grid-cols-5 gap-1.5;
}

.hue-picker__preset {
	@apply flex flex-col items-center gap-1;
}

.hue-picker__dot {
	@apply size-6 rounded-full ring-1 ring-black/5 dark:ring-white/10 transition-transform;
}

.hue-picker__preset:hover .hue-picker__dot {
	@apply scale-110;
}

.hue-picker__preset--active .hue-picker__dot {
	@apply ring-2 ring-primary scale-110;
}

.hue-picker__name {
	@apply text-[10px] text-muted-foreground;
}

/* ── Typography (style) list ─────────────────────────────────── */
.theme-switcher__type-list {
	@apply grid gap-2.5;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.type-card {
	@apply relative flex items-center gap-3 rounded-xl border border-border bg-card
		px-3.5 py-3 text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)];
}

.type-card:hover {
	@apply border-foreground/15 bg-muted/30 -translate-y-px shadow-sm;
}

.type-card--active {
	@apply border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm;
}

.type-card__sample {
	@apply flex items-center justify-center size-10 rounded-lg
		bg-muted/60 text-foreground text-lg shrink-0;
}

.type-card__body {
	@apply flex-1 flex flex-col min-w-0;
}

.type-card__name {
	@apply text-sm font-semibold text-foreground;
}

.type-card__hint {
	@apply text-[11px] text-muted-foreground truncate mt-0.5;
}

.type-card__check {
	@apply flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground shrink-0;
}

/* ── Slide transition ─────────────────────────────────────────── */
.slide-enter-active,
.slide-leave-active {
	transition: all 0.25s ease;
	overflow: hidden;
}
.slide-enter-from,
.slide-leave-to {
	opacity: 0;
	max-height: 0;
	transform: translateY(-8px);
}
.slide-enter-to,
.slide-leave-from {
	opacity: 1;
	max-height: 600px;
	transform: translateY(0);
}
</style>
