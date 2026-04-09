<template>
	<Teleport to="body">
		<Transition name="spotlight">
			<div v-if="open" class="spotlight-overlay" @click.self="close">
				<div class="spotlight-panel">
					<!-- Search Input -->
					<div class="spotlight-input-row">
						<UIcon name="i-heroicons-magnifying-glass" class="w-5 h-5 text-muted-foreground flex-shrink-0" />
						<input
							ref="inputRef"
							v-model="query"
							type="text"
							placeholder="Search apps..."
							class="spotlight-input"
							@keydown.escape="close"
							@keydown.enter="selectHighlighted"
							@keydown.down.prevent="moveDown"
							@keydown.up.prevent="moveUp"
						/>
						<kbd class="spotlight-kbd">esc</kbd>
					</div>

					<!-- Results -->
					<div v-if="results.length" class="spotlight-results">
						<button
							v-for="(link, i) in results"
							:key="link.to"
							class="spotlight-result"
							:class="{ 'spotlight-result--active': i === highlightIndex }"
							@click="navigate(link)"
							@mouseenter="highlightIndex = i"
						>
							<UIcon
								:name="link.icon"
								class="w-[18px] h-[18px] flex-shrink-0 text-muted-foreground"
							/>
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium text-foreground">{{ link.name }}</div>
								<div class="text-xs text-muted-foreground truncate">{{ link.description }}</div>
							</div>
						</button>
					</div>

					<!-- Empty State -->
					<div v-else-if="query.length > 0" class="spotlight-empty">
						<p class="text-sm text-muted-foreground">No apps found</p>
					</div>

					<!-- Hint -->
					<div v-else class="spotlight-empty">
						<p class="text-xs text-muted-foreground">Type to search all apps</p>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const router = useRouter();
const { defaultLinks } = useNavPreferences();

const query = ref('');
const highlightIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);

const results = computed(() => {
	if (!query.value.trim()) return defaultLinks.filter(l => l.to !== '/');
	const q = query.value.toLowerCase();
	return defaultLinks.filter(l =>
		l.to !== '/' && (
			l.name.toLowerCase().includes(q) ||
			l.description.toLowerCase().includes(q)
		),
	);
});

watch(() => query.value, () => {
	highlightIndex.value = 0;
});

watch(() => props.open, async (isOpen) => {
	if (isOpen) {
		query.value = '';
		highlightIndex.value = 0;
		await nextTick();
		inputRef.value?.focus();
	}
});

const close = () => emit('close');

const navigate = (link: any) => {
	router.push(link.to);
	close();
};

const selectHighlighted = () => {
	if (results.value[highlightIndex.value]) {
		navigate(results.value[highlightIndex.value]);
	}
};

const moveDown = () => {
	if (highlightIndex.value < results.value.length - 1) {
		highlightIndex.value++;
	}
};

const moveUp = () => {
	if (highlightIndex.value > 0) {
		highlightIndex.value--;
	}
};
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.spotlight-overlay {
	position: fixed;
	inset: 0;
	z-index: 100;
	display: flex;
	align-items: flex-start;
	justify-content: center;
	padding-top: 20vh;
	background: rgba(0, 0, 0, 0.4);
	backdrop-filter: blur(4px);
}

.spotlight-panel {
	width: 100%;
	max-width: 480px;
	background: hsl(var(--card));
	border: 1px solid hsl(var(--border) / 0.5);
	border-radius: 16px;
	box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
	overflow: hidden;
}

.spotlight-input-row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 14px 16px;
	border-bottom: 1px solid hsl(var(--border) / 0.3);
}

.spotlight-input {
	flex: 1;
	background: transparent;
	border: none;
	outline: none;
	font-size: 15px;
	color: hsl(var(--foreground));
}
.spotlight-input::placeholder {
	color: hsl(var(--muted-foreground) / 0.5);
}

.spotlight-kbd {
	font-size: 10px;
	font-weight: 500;
	padding: 2px 6px;
	border-radius: 4px;
	background: hsl(var(--muted) / 0.5);
	color: hsl(var(--muted-foreground));
	border: 1px solid hsl(var(--border) / 0.3);
}

.spotlight-results {
	max-height: 320px;
	overflow-y: auto;
	padding: 6px;
}

.spotlight-result {
	display: flex;
	align-items: center;
	gap: 12px;
	width: 100%;
	padding: 8px 10px;
	border-radius: 10px;
	text-align: left;
	cursor: pointer;
	transition: background 0.1s ease;
}

.spotlight-result:hover,
.spotlight-result--active {
	background: hsl(var(--muted) / 0.5);
}

.spotlight-empty {
	padding: 20px;
	text-align: center;
}

/* Transition */
.spotlight-enter-active { transition: all 0.15s ease; }
.spotlight-leave-active { transition: all 0.1s ease; }
.spotlight-enter-from { opacity: 0; }
.spotlight-enter-from .spotlight-panel { transform: scale(0.97) translateY(-8px); }
.spotlight-leave-to { opacity: 0; }
.spotlight-leave-to .spotlight-panel { transform: scale(0.97) translateY(-4px); }
</style>
