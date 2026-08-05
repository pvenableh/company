<template>
	<Teleport to="body">
		<Transition name="spotlight">
			<div v-if="open" class="spotlight-overlay" @click.self="close">
				<div class="spotlight-panel">
					<!-- Search Input -->
					<div class="spotlight-input-row">
						<EIcon name="i-heroicons-magnifying-glass" class="w-5 h-5 text-muted-foreground flex-shrink-0" />
						<input
							ref="inputRef"
							v-model="query"
							type="text"
							placeholder="Search apps, clients, records…"
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
						<template v-for="(item, i) in results" :key="item.kind + ':' + item.to">
							<!-- Section header whenever the group changes (Apps, Clients, …) -->
							<div v-if="i === 0 || item.section !== results[i - 1].section" class="spotlight-section">
								<span>{{ item.section }}</span>
							</div>
							<button
								class="spotlight-result"
								:class="{ 'spotlight-result--active': i === highlightIndex }"
								@click="navigate(item)"
								@mouseenter="highlightIndex = i"
							>
								<EIcon
									:name="item.icon"
									class="w-[18px] h-[18px] flex-shrink-0 text-muted-foreground"
								/>
								<div class="flex-1 min-w-0">
									<div class="text-sm font-medium text-foreground">{{ item.name }}</div>
									<div class="text-xs text-muted-foreground truncate">{{ item.description }}</div>
								</div>
							</button>
						</template>
						<div v-if="searching" class="spotlight-searching">Searching records…</div>
					</div>

					<!-- Empty State -->
					<div v-else-if="query.length >= 2" class="spotlight-empty">
						<p class="text-sm text-muted-foreground">{{ searching ? 'Searching…' : 'No matches found' }}</p>
					</div>

					<!-- Hint -->
					<div v-else class="spotlight-empty">
						<p class="text-xs text-muted-foreground">{{ query.length === 1 ? 'Keep typing…' : 'Search apps and org records' }}</p>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const router = useRouter();
const { defaultLinks, visibleLinks } = useNavPreferences();

const query = ref('');
const highlightIndex = ref(0);
const inputRef = ref<HTMLInputElement | null>(null);

// Visible-in-sidebar first, hidden-from-sidebar after
const orderedLinks = computed(() => {
	const visibleSet = new Set(visibleLinks.value.map(l => l.to));
	const inHat = defaultLinks.filter(l => l.to !== '/' && visibleSet.has(l.to));
	const others = defaultLinks.filter(l => l.to !== '/' && !visibleSet.has(l.to));
	return { inHat, others };
});

// Unified result item — an app-nav destination OR an org record hit.
type ResultItem = { kind: 'app' | 'entity'; section: string; to: string; name: string; description: string; icon: string };

// ── Org-wide entity search (records: clients, contacts, leads, …) ───────────
// Debounced call to /api/search; app-nav matches stay local + instant.
type EntityGroup = { key: string; label: string; icon: string; items: Array<{ id: string | number; name: string; description: string; to: string }> };
const entityGroups = ref<EntityGroup[]>([]);
const searching = ref(false);
const runEntitySearch = useDebounceFn(async (q: string) => {
	if (q.length < 2) { entityGroups.value = []; searching.value = false; return; }
	searching.value = true;
	try {
		const r = await $fetch<{ groups: EntityGroup[] }>('/api/search', { query: { q } });
		entityGroups.value = r.groups || [];
	} catch {
		entityGroups.value = [];
	} finally {
		searching.value = false;
	}
}, 220);

const results = computed<ResultItem[]>(() => {
	const { inHat, others } = orderedLinks.value;
	const q = query.value.trim().toLowerCase();
	const matches = (l: { name: string; description: string }) =>
		!q || l.name.toLowerCase().includes(q) || l.description.toLowerCase().includes(q);
	const appItems: ResultItem[] = [...inHat.filter(matches), ...others.filter(matches)].map((l) => ({
		kind: 'app', section: 'Apps', to: l.to, name: l.name, description: l.description, icon: l.icon,
	}));
	const entityItems: ResultItem[] = entityGroups.value.flatMap((g) =>
		g.items.map((it) => ({ kind: 'entity', section: g.label, to: it.to, name: it.name, description: it.description, icon: g.icon })),
	);
	return [...appItems, ...entityItems];
});

watch(() => query.value, (q) => {
	highlightIndex.value = 0;
	runEntitySearch(q.trim());
});

watch(() => props.open, async (isOpen) => {
	if (isOpen) {
		query.value = '';
		highlightIndex.value = 0;
		entityGroups.value = [];
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

.spotlight-section {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 10px 4px;
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: hsl(var(--muted-foreground));
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

.spotlight-searching {
	padding: 8px 12px 4px;
	font-size: 11px;
	color: hsl(var(--muted-foreground) / 0.7);
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
