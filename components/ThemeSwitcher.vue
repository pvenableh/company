<template>
	<div class="space-y-5">
		<!-- Color themes -->
		<div class="space-y-3">
			<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Color</h4>
			<div class="grid grid-cols-2 gap-2">
				<button
					v-for="theme in themes"
					:key="theme.id"
					@click="setTheme(theme.id)"
					class="group relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ios-press"
					:class="
						currentTheme === theme.id
							? 'border-primary bg-primary/5 shadow-sm'
							: 'border-border hover:border-primary/40 hover:bg-muted/30'
					"
				>
					<!-- Swatches -->
					<div class="flex -space-x-1">
						<span
							v-for="(swatch, i) in theme.swatches.slice(0, 3)"
							:key="i"
							class="w-4 h-4 rounded-full ring-1 ring-background"
							:style="{ backgroundColor: swatch }"
						/>
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
const { themes, styles, currentTheme, currentStyle, setTheme, setStyle } = useTheme();
</script>
