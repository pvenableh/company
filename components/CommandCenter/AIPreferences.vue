<script setup lang="ts">
const emit = defineEmits<{
	(e: 'close'): void;
}>();

const { modules, enabledModules, toggle, isEnabled, enableAll, disableAll } = useAIPreferences();

const enabledCount = computed(() => enabledModules.value.size);
const totalCount = modules.length;

// Group modules by category
const groupedModules = computed(() => {
	const groups = new Map<string, typeof modules>();
	for (const mod of modules) {
		const list = groups.get(mod.category) || [];
		list.push(mod);
		groups.set(mod.category, list);
	}
	return groups;
});
</script>

<template>
	<div class="p-4">
		<div class="flex items-center justify-between mb-4">
			<div>
				<h3 class="text-sm font-bold text-gray-900 dark:text-white">AI Preferences</h3>
				<p class="text-xs text-gray-500 mt-0.5">
					{{ enabledCount }}/{{ totalCount }} modules active
				</p>
			</div>
			<div class="flex items-center gap-2">
				<button
					@click="enableAll"
					class="text-[10px] px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
				>
					Enable All
				</button>
				<button
					@click="disableAll"
					class="text-[10px] px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
				>
					Disable All
				</button>
			</div>
		</div>

		<div class="space-y-4">
			<div v-for="[category, mods] in groupedModules" :key="category">
				<p class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
					{{ category }}
				</p>
				<div class="space-y-1">
					<button
						v-for="mod in mods"
						:key="mod.key"
						@click="toggle(mod.key)"
						class="w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left"
						:class="
							isEnabled(mod.key)
								? 'bg-primary/5 hover:bg-primary/10'
								: 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 opacity-60'
						"
					>
						<div
							class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
							:class="isEnabled(mod.key) ? 'bg-primary/10' : 'bg-gray-200 dark:bg-gray-700'"
						>
							<UIcon
								:name="mod.icon"
								class="w-4 h-4"
								:class="isEnabled(mod.key) ? 'text-primary' : 'text-gray-400'"
							/>
						</div>
						<div class="flex-1 min-w-0">
							<p
								class="text-xs font-medium"
								:class="isEnabled(mod.key) ? 'text-gray-900 dark:text-white' : 'text-gray-500'"
							>
								{{ mod.label }}
							</p>
							<p class="text-[10px] text-gray-400 truncate">{{ mod.description }}</p>
						</div>
						<div
							class="w-8 h-5 rounded-full flex items-center transition-colors flex-shrink-0 px-0.5"
							:class="isEnabled(mod.key) ? 'bg-primary justify-end' : 'bg-gray-300 dark:bg-gray-600 justify-start'"
						>
							<div class="w-4 h-4 bg-white rounded-full shadow-sm" />
						</div>
					</button>
				</div>
			</div>
		</div>

		<button
			@click="emit('close')"
			class="w-full mt-4 text-xs text-center text-primary hover:underline py-2"
		>
			Done
		</button>
	</div>
</template>
