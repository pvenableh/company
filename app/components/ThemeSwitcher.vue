<template>
	<div class="space-y-8">
		<!-- Layout Mode Section -->
		<div class="space-y-3">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Layout</h4>
			<p class="text-[10px] text-muted-foreground -mt-1">Choose how you navigate Earnest</p>

			<div class="grid grid-cols-3 gap-2.5">
				<button
					v-for="mode in modes"
					:key="mode.id"
					@click="setMode(mode.id)"
					class="group relative flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition-all duration-200 ios-press"
					:class="
						currentMode === mode.id
							? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm'
							: 'border-border hover:border-primary/30 hover:bg-muted/20'
					"
				>
					<Icon :name="mode.icon" class="w-6 h-6 text-foreground/70" />
					<div>
						<p class="text-xs font-semibold text-foreground">{{ mode.name }}</p>
						<p class="text-[9px] text-muted-foreground leading-tight mt-0.5">{{ mode.description }}</p>
					</div>
					<div
						v-if="currentMode === mode.id"
						class="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center"
					>
						<Icon name="lucide:check" class="w-2.5 h-2.5 text-primary-foreground" />
					</div>
				</button>
			</div>
		</div>

		<!-- Color Scheme Section -->
		<div class="space-y-3">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Color Scheme</h4>

			<!-- Pantone-style theme chips -->
			<div class="grid grid-cols-2 gap-3">
				<button
					v-for="theme in themes"
					:key="theme.id"
					v-show="theme.id !== 'mono' && theme.id !== 'chromatic'"
					@click="handleThemeClick(theme.id)"
					class="pantone-chip group"
					:class="currentTheme === theme.id ? 'pantone-chip--active' : ''"
				>
					<!-- Color block -->
					<div class="pantone-chip__color">
						<div
							class="absolute inset-0 rounded-t-[5px]"
							:style="{
								background: `linear-gradient(135deg, ${theme.swatches[0]}, ${theme.swatches[2] || theme.swatches[1]})`,
							}"
						/>
						<div
							v-if="currentTheme === theme.id"
							class="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white/90 flex items-center justify-center shadow-sm"
						>
							<Icon name="lucide:check" class="w-2.5 h-2.5 text-gray-900" />
						</div>
					</div>
					<div class="pantone-chip__label">
						<span class="text-[9px] font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 truncate">{{ theme.name }}</span>
						<span class="text-[8px] text-gray-500 dark:text-gray-400 block truncate">{{ theme.description }}</span>
					</div>
				</button>
			</div>

			<!-- Advanced: Mono/Chromatic toggle -->
			<button
				@click="showAdvancedColors = !showAdvancedColors"
				class="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
			>
				<Icon :name="showAdvancedColors ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="w-3 h-3" />
				<span>Custom color</span>
			</button>

			<transition name="slide">
				<div v-if="showAdvancedColors" class="space-y-3">
					<div class="grid grid-cols-2 gap-3">
						<button
							v-for="theme in themes.filter(t => t.id === 'mono' || t.id === 'chromatic')"
							:key="theme.id"
							@click="handleThemeClick(theme.id)"
							class="pantone-chip group"
							:class="currentTheme === theme.id ? 'pantone-chip--active' : ''"
						>
							<div class="pantone-chip__color">
								<div
									v-if="theme.id === 'mono'"
									class="absolute inset-0 rounded-t-[5px]"
									:style="{ background: `linear-gradient(135deg, hsl(${monoHue}, 55%, 65%), hsl(${monoHue}, 55%, 35%))` }"
								/>
								<div
									v-else
									class="absolute inset-0 rounded-t-[5px]"
									:style="{ background: `linear-gradient(135deg, hsl(${monoHue}, 65%, 50%), hsl(${(monoHue + 150) % 360}, 55%, 50%), hsl(${(monoHue + 30) % 360}, 50%, 55%))` }"
								/>
								<div
									v-if="currentTheme === theme.id"
									class="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white/90 flex items-center justify-center shadow-sm"
								>
									<Icon name="lucide:check" class="w-2.5 h-2.5 text-gray-900" />
								</div>
							</div>
							<div class="pantone-chip__label">
								<span class="text-[9px] font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 truncate">{{ theme.name }}</span>
							</div>
						</button>
					</div>

					<!-- Hue slider for mono/chromatic -->
					<transition name="slide">
						<div v-if="currentTheme === 'mono' || currentTheme === 'chromatic'" class="space-y-3 rounded-xl border bg-card/50 p-3">
							<div class="flex items-center justify-between">
								<span class="text-[10px] text-muted-foreground font-medium">Hue</span>
								<span class="text-[10px] text-muted-foreground font-mono tabular-nums bg-muted px-1.5 py-0.5 rounded">{{ monoHue }}°</span>
							</div>
							<div class="relative h-8 rounded-lg overflow-hidden shadow-inner">
								<div class="absolute inset-0 hue-gradient rounded-lg" />
								<input
									type="range"
									:value="monoHue"
									min="0"
									max="359"
									step="1"
									class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
									@input="setMonoHue(Number(($event.target as HTMLInputElement).value))"
								/>
								<div
									class="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-[2px] border-white shadow-lg pointer-events-none transition-[left] duration-75"
									:style="{
										left: `calc(${(monoHue / 359) * 100}% - 10px)`,
										backgroundColor: `hsl(${monoHue}, 55%, 50%)`,
									}"
								/>
							</div>
							<div class="grid grid-cols-5 gap-1.5">
								<button
									v-for="preset in monoPresets"
									:key="preset.hue"
									@click="setMonoHue(preset.hue)"
									class="flex flex-col items-center gap-1 group/swatch"
								>
									<div
										class="w-6 h-6 rounded-full ring-1 ring-black/5 dark:ring-white/10 transition-transform group-hover/swatch:scale-110"
										:class="monoHue === preset.hue ? 'ring-2 ring-primary scale-110' : ''"
										:style="{ backgroundColor: preset.color }"
									/>
									<span class="text-[7px] text-muted-foreground">{{ preset.name }}</span>
								</button>
							</div>
						</div>
					</transition>
				</div>
			</transition>
		</div>

		<!-- Timeline Icon Theme Section -->
		<div class="space-y-3">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Timeline Icons</h4>
			<p class="text-[10px] text-muted-foreground -mt-1">Choose an icon theme for your activity timeline cards</p>

			<div class="grid grid-cols-3 gap-2">
				<button
					v-for="theme in timelineThemes"
					:key="theme.id"
					@click="setTimelineTheme(theme.id)"
					class="group relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-all duration-200 ios-press"
					:class="
						currentTimelineThemeId === theme.id
							? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm'
							: 'border-border hover:border-primary/30 hover:bg-muted/20'
					"
				>
					<div class="grid grid-cols-2 gap-1">
						<Icon
							v-for="(icon, idx) in getThemePreviewIcons(theme)"
							:key="idx"
							:name="icon"
							class="w-5 h-5"
						/>
					</div>
					<span class="text-[10px] font-semibold text-foreground">{{ theme.name }}</span>
					<span class="text-[8px] text-muted-foreground leading-tight">{{ theme.description }}</span>
					<div
						v-if="currentTimelineThemeId === theme.id"
						class="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center"
					>
						<Icon name="lucide:check" class="w-2.5 h-2.5 text-primary-foreground" />
					</div>
				</button>
			</div>
		</div>

		<!-- Style Section -->
		<div class="space-y-3">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Typography Style</h4>
			<div class="space-y-2">
				<div
					v-for="style in styles"
					:key="style.id"
					role="button"
					tabindex="0"
					@click="setStyle(style.id)"
					@keydown.enter.prevent="setStyle(style.id)"
					@keydown.space.prevent="setStyle(style.id)"
					class="w-full group relative flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 ios-press cursor-pointer"
					:class="
						currentStyle === style.id
							? 'border-primary bg-primary/5 ring-1 ring-primary/20 shadow-sm'
							: 'border-border hover:border-primary/30 hover:bg-muted/20'
					"
				>
					<div class="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
						<span class="text-base" :class="getStylePreviewClass(style.id)">Aa</span>
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-foreground">{{ style.name }}</p>
						<p class="text-[10px] text-muted-foreground truncate">{{ style.description }}</p>
					</div>
					<div
						v-if="currentStyle === style.id"
						class="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0"
					>
						<Icon name="lucide:check" class="w-2.5 h-2.5 text-primary-foreground" />
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const { themes, styles, monoPresets, currentTheme, currentStyle, monoHue, setTheme, setStyle, setMonoHue } = useTheme();
const { themes: timelineThemes, currentThemeId: currentTimelineThemeId, setTheme: setTimelineTheme } = useTimelineTheme();
const { modes, currentMode, setMode } = useLayoutMode();

const showAdvancedColors = ref(false);

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
/* ── Pantone chip card ─────────────────────────────────────── */
.pantone-chip {
	display: flex;
	flex-direction: column;
	border-radius: 6px;
	overflow: hidden;
	cursor: pointer;
	transition: all 0.2s ease;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
}
.pantone-chip:hover {
	transform: translateY(-2px);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.pantone-chip--active {
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1), 0 0 0 2px hsl(var(--primary));
}
.pantone-chip--active:hover {
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12), 0 0 0 2px hsl(var(--primary));
}
.pantone-chip__color {
	position: relative;
	width: 100%;
	aspect-ratio: 2 / 1;
}
.pantone-chip__label {
	padding: 6px 8px 7px;
	background: white;
	text-align: center;
	line-height: 1.3;
}
:root.dark .pantone-chip__label,
.dark .pantone-chip__label {
	background: hsl(var(--card));
}

/* ── Hue gradient ──────────────────────────────────────────── */
.hue-gradient {
	background: linear-gradient(
		to right,
		hsl(0, 60%, 50%), hsl(30, 60%, 50%), hsl(60, 60%, 50%),
		hsl(90, 60%, 50%), hsl(120, 60%, 50%), hsl(150, 60%, 50%),
		hsl(180, 60%, 50%), hsl(210, 60%, 50%), hsl(240, 60%, 50%),
		hsl(270, 60%, 50%), hsl(300, 60%, 50%), hsl(330, 60%, 50%),
		hsl(359, 60%, 50%)
	);
}

/* ── Slide transition ──────────────────────────────────────── */
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
