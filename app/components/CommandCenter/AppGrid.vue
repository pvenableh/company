<script setup lang="ts">
const router = useRouter();
const { visibleLinks } = useNavPreferences();

const props = defineProps<{
	badges?: Record<string, number>;
}>();

// Filter out Command Center itself (we're already on it) and use visible links
const apps = computed(() =>
	visibleLinks.value.filter((link) => link.to !== '/')
);

const navigateTo = (route: string) => {
	router.push(route);
};
</script>

<template>
	<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-2.5">
		<button
			v-for="app in apps"
			:key="app.to"
			class="group flex flex-col items-center gap-1.5 sm:gap-2 p-2 sm:p-2.5 rounded-2xl hover:bg-muted/40 transition-all duration-200 cursor-pointer ios-press"
			@click="navigateTo(app.to)"
		>
			<div class="relative">
				<div
					:class="[app.color]"
					class="w-12 h-12 sm:w-13 sm:h-13 rounded-[14px] sm:rounded-[16px] flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:scale-[1.04] transition-all duration-200"
				>
					<UIcon :name="app.icon" class="w-5 h-5 sm:w-6 sm:h-6 text-white" />
				</div>
				<span
					v-if="badges?.[app.name.toLowerCase()]"
					class="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center ring-2 ring-background"
				>
					{{ badges[app.name.toLowerCase()] > 9 ? '9+' : badges[app.name.toLowerCase()] }}
				</span>
			</div>
			<div class="text-center">
				<span class="text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-foreground/80 group-hover:text-foreground transition-colors leading-tight">
					{{ app.name }}
				</span>
				<p class="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5 hidden sm:block leading-tight tracking-tight">{{ app.description }}</p>
			</div>
		</button>
	</div>
</template>
