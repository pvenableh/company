<template>
	<div class="space-y-6">
		<!-- Color Theme Section -->
		<div class="space-y-3">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Color Theme</h4>

			<!-- Pantone-style theme chips -->
			<div class="grid grid-cols-5 gap-2.5">
				<button
					v-for="theme in themes"
					:key="theme.id"
					@click="handleThemeClick(theme.id)"
					class="pantone-chip group"
					:class="currentTheme === theme.id ? 'pantone-chip--active' : ''"
				>
					<!-- Color block -->
					<div class="pantone-chip__color">
						<template v-if="theme.id === 'mono'">
							<!-- Mono: gradient from the current hue -->
							<div
								class="absolute inset-0 rounded-t-[5px]"
								:style="{
									background: `linear-gradient(135deg, hsl(${monoHue}, 55%, 65%), hsl(${monoHue}, 55%, 35%))`,
								}"
							/>
						</template>
						<template v-else>
							<!-- Named themes: diagonal gradient from swatches -->
							<div
								class="absolute inset-0 rounded-t-[5px]"
								:style="{
									background: `linear-gradient(135deg, ${theme.swatches[0]}, ${theme.swatches[2] || theme.swatches[1]})`,
								}"
							/>
						</template>

						<!-- Active check -->
						<div
							v-if="currentTheme === theme.id"
							class="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white/90 flex items-center justify-center shadow-sm"
						>
							<Icon name="lucide:check" class="w-2.5 h-2.5 text-gray-900" />
						</div>
					</div>

					<!-- White label strip -->
					<div class="pantone-chip__label">
						<span class="text-[9px] font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 truncate">{{ theme.name }}</span>
					</div>
				</button>
			</div>
		</div>

		<!-- Mono Customization Panel -->
		<transition name="slide">
			<div v-if="currentTheme === 'mono'" class="space-y-4 rounded-xl border bg-card/50 p-4">
				<div class="flex items-center justify-between">
					<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customize Color</h4>
					<span class="text-[10px] text-muted-foreground font-mono tabular-nums bg-muted px-1.5 py-0.5 rounded">{{ monoHue }}°</span>
				</div>

				<!-- Hue gradient slider -->
				<div class="relative h-10 rounded-xl overflow-hidden shadow-inner">
					<div class="absolute inset-0 hue-gradient rounded-xl" />
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
						class="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-[3px] border-white shadow-lg pointer-events-none transition-[left] duration-75"
						:style="{
							left: `calc(${(monoHue / 359) * 100}% - 12px)`,
							backgroundColor: `hsl(${monoHue}, 55%, 50%)`,
						}"
					/>
				</div>

				<!-- Pantone-style preset chips -->
				<div class="grid grid-cols-5 gap-2">
					<button
						v-for="preset in monoPresets"
						:key="preset.hue"
						@click="setMonoHue(preset.hue)"
						class="pantone-chip pantone-chip--sm group/swatch"
						:class="monoHue === preset.hue ? 'pantone-chip--active' : ''"
					>
						<div class="pantone-chip__color" :style="{ backgroundColor: preset.color }">
							<div
								v-if="monoHue === preset.hue"
								class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white/90 flex items-center justify-center shadow-sm"
							>
								<Icon name="lucide:check" class="w-2 h-2 text-gray-900" />
							</div>
						</div>
						<div class="pantone-chip__label">
							<span class="text-[8px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">{{ preset.name }}</span>
						</div>
					</button>
				</div>

				<!-- Generated palette as Pantone strip -->
				<div>
					<p class="text-[10px] text-muted-foreground mb-1.5 font-medium">Generated Palette</p>
					<div class="flex rounded-lg overflow-hidden shadow-sm border border-black/5 dark:border-white/5">
						<div
							v-for="(step, i) in paletteSteps"
							:key="i"
							class="flex-1 h-10 transition-colors duration-200"
							:style="{ backgroundColor: step }"
						/>
					</div>
					<div class="flex justify-between mt-1">
						<span class="text-[9px] text-muted-foreground">50</span>
						<span class="text-[9px] text-muted-foreground">950</span>
					</div>
				</div>

				<!-- Semantic tokens -->
				<div>
					<p class="text-[10px] text-muted-foreground mb-1.5 font-medium">Semantic Tokens</p>
					<div class="flex flex-wrap gap-1.5">
						<span
							v-for="token in semanticTokens"
							:key="token.label"
							class="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border bg-background"
						>
							<span
								class="w-3 h-3 rounded-full ring-1 ring-black/5 dark:ring-white/10 shrink-0"
								:style="{ backgroundColor: token.color }"
							/>
							<span class="text-muted-foreground font-medium">{{ token.label }}</span>
						</span>
					</div>
				</div>
			</div>
		</transition>

		<!-- Style Section -->
		<div class="space-y-3">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Typography Style</h4>
			<div class="space-y-2">
				<button
					v-for="style in styles"
					:key="style.id"
					@click="setStyle(style.id)"
					class="w-full group relative flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 ios-press"
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
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const { themes, styles, monoPresets, currentTheme, currentStyle, monoHue, setTheme, setStyle, setMonoHue } = useTheme();

const handleThemeClick = (themeId: string) => {
	setTheme(themeId);
};

const activePresetName = computed(() => {
	const match = monoPresets.find((p) => p.hue === monoHue.value);
	return match?.name || null;
});

/** Palette preview steps from light to dark */
const paletteSteps = computed(() => {
	const h = monoHue.value;
	return [98, 92, 82, 70, 55, 42, 30, 18, 10, 5].map(
		(l) => `hsl(${h}, ${l > 80 ? 18 : l < 20 ? 12 : 50}%, ${l}%)`
	);
});

/** Semantic token pills showing how the mono hue maps to roles */
const semanticTokens = computed(() => {
	const h = monoHue.value;
	return [
		{ label: 'Primary', color: `hsl(${h}, 55%, 42%)` },
		{ label: 'Background', color: `hsl(${h}, 20%, 98%)` },
		{ label: 'Foreground', color: `hsl(${h}, 15%, 10%)` },
		{ label: 'Muted', color: `hsl(${h}, 18%, 92%)` },
		{ label: 'Border', color: `hsl(${h}, 14%, 88%)` },
		{ label: 'Accent', color: `hsl(${h}, 50%, 60%)` },
	];
});

/** Get a preview font class for each style variant */
function getStylePreviewClass(styleId: string): string {
	switch (styleId) {
		case 'modern': return 'font-sans font-bold tracking-tight';
		case 'classic': return 'font-serif font-semibold';
		case 'casual': return 'font-casual';
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

/* Color block — tall rectangle */
.pantone-chip__color {
	position: relative;
	width: 100%;
	aspect-ratio: 1 / 1.15;
}

/* White label strip at bottom */
.pantone-chip__label {
	padding: 4px 5px 5px;
	background: white;
	text-align: center;
	line-height: 1;
}
:root.dark .pantone-chip__label,
.dark .pantone-chip__label {
	background: hsl(var(--card));
}

/* Smaller variant for preset chips */
.pantone-chip--sm .pantone-chip__color {
	aspect-ratio: 1 / 1;
}
.pantone-chip--sm .pantone-chip__label {
	padding: 3px 2px 4px;
}

/* ── Hue gradient ──────────────────────────────────────────── */
.hue-gradient {
	background: linear-gradient(
		to right,
		hsl(0, 60%, 50%),
		hsl(30, 60%, 50%),
		hsl(60, 60%, 50%),
		hsl(90, 60%, 50%),
		hsl(120, 60%, 50%),
		hsl(150, 60%, 50%),
		hsl(180, 60%, 50%),
		hsl(210, 60%, 50%),
		hsl(240, 60%, 50%),
		hsl(270, 60%, 50%),
		hsl(300, 60%, 50%),
		hsl(330, 60%, 50%),
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
