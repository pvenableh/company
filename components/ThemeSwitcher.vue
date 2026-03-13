<template>
	<div class="space-y-5">
		<!-- Color themes -->
		<div class="space-y-3">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Color</h4>
			<div class="grid grid-cols-2 gap-2">
				<button
					v-for="theme in themes"
					:key="theme.id"
					@click="handleThemeClick(theme.id)"
					class="group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ios-press"
					:class="
						currentTheme === theme.id
							? 'border-primary bg-primary/5 shadow-sm'
							: 'border-border hover:border-primary/40 hover:bg-muted/30'
					"
				>
					<!-- Swatches — static for named themes, dynamic for mono -->
					<div class="flex -space-x-1">
						<template v-if="theme.id === 'mono'">
							<span
								v-for="(l, i) in [35, 50, 65]"
								:key="i"
								class="w-4 h-4 rounded-full ring-1 ring-background"
								:style="{ backgroundColor: `hsl(${monoHue}, 55%, ${l}%)` }"
							/>
						</template>
						<template v-else>
							<span
								v-for="(swatch, i) in theme.swatches.slice(0, 3)"
								:key="i"
								class="w-4 h-4 rounded-full ring-1 ring-background"
								:style="{ backgroundColor: swatch }"
							/>
						</template>
					</div>

					<!-- Label -->
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium truncate text-foreground">{{ theme.name }}</p>
					</div>

					<!-- Active indicator -->
					<span
						v-if="currentTheme === theme.id"
						class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
					/>
				</button>
			</div>
		</div>

		<!-- Mono color picker — shown when mono theme is active -->
		<transition name="slide">
			<div v-if="currentTheme === 'mono'" class="space-y-4">
				<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Base Color</h4>

				<!-- Hue slider -->
				<div class="space-y-2">
					<div class="relative h-8 rounded-lg overflow-hidden">
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
						<!-- Thumb indicator -->
						<div
							class="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-md pointer-events-none transition-[left] duration-75"
							:style="{
								left: `calc(${(monoHue / 359) * 100}% - 10px)`,
								backgroundColor: `hsl(${monoHue}, 55%, 50%)`,
							}"
						/>
					</div>
					<div class="flex justify-between text-[10px] text-muted-foreground">
						<span>{{ monoHue }}°</span>
						<span>{{ activePresetName || 'Custom' }}</span>
					</div>
				</div>

				<!-- Preset swatches -->
				<div class="flex flex-wrap gap-1.5">
					<button
						v-for="preset in monoPresets"
						:key="preset.hue"
						@click="setMonoHue(preset.hue)"
						class="group/swatch relative w-7 h-7 rounded-full transition-all duration-200 ring-offset-2 ring-offset-background"
						:class="monoHue === preset.hue ? 'ring-2 ring-primary scale-110' : 'hover:scale-105'"
						:style="{ backgroundColor: preset.color }"
						:title="preset.name"
					>
						<span v-if="monoHue === preset.hue" class="absolute inset-0 flex items-center justify-center">
							<UIcon name="i-heroicons-check" class="w-3.5 h-3.5 text-white drop-shadow" />
						</span>
					</button>
				</div>

				<!-- Live preview strip -->
				<div class="flex gap-1 rounded-lg overflow-hidden h-6">
					<div
						v-for="l in [98, 92, 70, 50, 30, 15, 7]"
						:key="l"
						class="flex-1"
						:style="{ backgroundColor: `hsl(${monoHue}, ${l > 80 ? 18 : l < 20 ? 12 : 50}%, ${l}%)` }"
					/>
				</div>
			</div>
		</transition>

		<!-- Style variants -->
		<div class="space-y-3">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Style</h4>
			<div class="grid grid-cols-2 gap-2">
				<button
					v-for="style in styles"
					:key="style.id"
					@click="setStyle(style.id)"
					class="group relative flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ios-press"
					:class="
						currentStyle === style.id
							? 'border-primary bg-primary/5 shadow-sm'
							: 'border-border hover:border-primary/40 hover:bg-muted/30'
					"
				>
					<div class="flex items-center justify-between w-full">
						<p class="text-sm font-medium text-foreground">{{ style.name }}</p>
						<span
							v-if="currentStyle === style.id"
							class="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
						/>
					</div>
					<p class="text-[11px] text-muted-foreground mt-0.5">{{ style.description }}</p>
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
</script>

<style scoped>
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
	max-height: 300px;
	transform: translateY(0);
}
</style>
