<script setup lang="ts">
const emit = defineEmits<{
	(e: 'close'): void;
}>();

const { modules, enabledModules, toggle, isEnabled, enableAll, disableAll, personalizationsEnabled, lowUsageMode } = useAIPreferences();
const { personas, selectedPersona, setPersona } = useAIPersona();
const { usageSummary } = useAITokens();

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

const activeSection = ref<'modules' | 'persona' | 'settings'>('modules');

const formatTokens = (n: number) => {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
	return String(n);
};
</script>

<template>
	<div class="p-4">
		<div class="flex items-center justify-between mb-4">
			<div>
				<h3 class="text-sm font-bold text-foreground">Earnest Settings</h3>
				<p class="text-xs text-muted-foreground mt-0.5">
					{{ enabledCount }}/{{ totalCount }} modules active
				</p>
			</div>
		</div>

		<!-- Section Tabs -->
		<div class="flex gap-1 p-0.5 bg-muted/40 rounded-lg mb-4">
			<button
				v-for="tab in [
					{ key: 'modules', label: 'Modules' },
					{ key: 'persona', label: 'Persona' },
					{ key: 'settings', label: 'Settings' },
				]"
				:key="tab.key"
				@click="activeSection = tab.key as any"
				class="flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all"
				:class="activeSection === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
			>
				{{ tab.label }}
			</button>
		</div>

		<!-- Modules Section -->
		<div v-if="activeSection === 'modules'" class="space-y-4">
			<div class="flex items-center gap-2 mb-2">
				<button
					@click="enableAll"
					class="text-[10px] px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
				>
					Enable All
				</button>
				<button
					@click="disableAll"
					class="text-[10px] px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
				>
					Disable All
				</button>
			</div>

			<div v-for="[category, mods] in groupedModules" :key="category">
				<p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
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
								: 'bg-muted/30 hover:bg-muted/50 opacity-60'
						"
					>
						<div
							class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
							:class="isEnabled(mod.key) ? 'bg-primary/10' : 'bg-muted'"
						>
							<UIcon
								:name="mod.icon"
								class="w-4 h-4"
								:class="isEnabled(mod.key) ? 'text-primary' : 'text-muted-foreground'"
							/>
						</div>
						<div class="flex-1 min-w-0">
							<p
								class="text-xs font-medium"
								:class="isEnabled(mod.key) ? 'text-foreground' : 'text-muted-foreground'"
							>
								{{ mod.label }}
							</p>
							<p class="text-[10px] text-muted-foreground truncate">{{ mod.description }}</p>
						</div>
						<div
							class="w-8 h-5 rounded-full flex items-center transition-colors flex-shrink-0 px-0.5"
							:class="isEnabled(mod.key) ? 'bg-primary justify-end' : 'bg-muted justify-start'"
						>
							<div class="w-4 h-4 bg-white rounded-full shadow-sm" />
						</div>
					</button>
				</div>
			</div>
		</div>

		<!-- Persona Section -->
		<div v-if="activeSection === 'persona'" class="space-y-3">
			<p class="text-xs text-muted-foreground">Choose how Earnest communicates with you.</p>
			<div class="space-y-2">
				<button
					v-for="p in personas"
					:key="p.value"
					@click="setPersona(p.value)"
					class="w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left"
					:class="selectedPersona === p.value ? p.activeClass : 'border-border hover:border-border/80'"
				>
					<div
						class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
						:class="selectedPersona === p.value ? p.iconBg : 'bg-muted'"
					>
						<UIcon
							:name="p.icon"
							class="w-5 h-5"
							:class="selectedPersona === p.value ? p.iconColor : 'text-muted-foreground'"
						/>
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-foreground">{{ p.label }}</p>
						<p class="text-[11px] text-muted-foreground">{{ p.description }}</p>
					</div>
					<div
						v-if="selectedPersona === p.value"
						class="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0"
					>
						<UIcon name="i-heroicons-check" class="w-3 h-3 text-primary-foreground" />
					</div>
				</button>
			</div>
		</div>

		<!-- Settings Section -->
		<div v-if="activeSection === 'settings'" class="space-y-4">
			<!-- Personalizations -->
			<div class="flex items-center justify-between p-3 rounded-lg bg-muted/20">
				<div>
					<p class="text-xs font-medium text-foreground">Personalizations</p>
					<p class="text-[10px] text-muted-foreground">Generate unique greetings with AI</p>
				</div>
				<button
					@click="personalizationsEnabled = !personalizationsEnabled"
					class="w-10 h-6 rounded-full flex items-center transition-colors flex-shrink-0 px-0.5"
					:class="personalizationsEnabled ? 'bg-primary justify-end' : 'bg-muted justify-start'"
				>
					<div class="w-5 h-5 bg-white rounded-full shadow-sm" />
				</button>
			</div>

			<!-- Low Usage Mode -->
			<div class="flex items-center justify-between p-3 rounded-lg bg-muted/20">
				<div>
					<p class="text-xs font-medium text-foreground">Low Usage Mode</p>
					<p class="text-[10px] text-muted-foreground">Reduce AI token consumption</p>
				</div>
				<button
					@click="lowUsageMode = !lowUsageMode"
					class="w-10 h-6 rounded-full flex items-center transition-colors flex-shrink-0 px-0.5"
					:class="lowUsageMode ? 'bg-amber-500 justify-end' : 'bg-muted justify-start'"
				>
					<div class="w-5 h-5 bg-white rounded-full shadow-sm" />
				</button>
			</div>

			<!-- Low usage explanation -->
			<div v-if="lowUsageMode" class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
				<p class="text-[11px] text-amber-400">
					Low usage mode disables generated greetings, reduces suggestion frequency, and skips auto-generated content to conserve tokens.
				</p>
			</div>

			<!-- Usage Summary -->
			<div v-if="usageSummary" class="p-3 rounded-lg bg-muted/20">
				<p class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Your Usage This Month</p>
				<div class="flex items-center justify-between text-xs">
					<span class="text-muted-foreground">Tokens used</span>
					<span class="font-medium text-foreground">{{ formatTokens(usageSummary.userTokensUsed) }}</span>
				</div>
				<div v-if="usageSummary.userBudget" class="mt-1">
					<div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
						<div
							class="h-full rounded-full transition-all"
							:class="usageSummary.userTokensUsed / usageSummary.userBudget > 0.8 ? 'bg-red-500' : 'bg-primary'"
							:style="{ width: Math.min(100, (usageSummary.userTokensUsed / usageSummary.userBudget) * 100) + '%' }"
						/>
					</div>
					<p class="text-[10px] text-muted-foreground mt-0.5">
						{{ formatTokens(usageSummary.userTokensUsed) }} / {{ formatTokens(usageSummary.userBudget) }}
					</p>
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
