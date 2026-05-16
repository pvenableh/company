<script setup lang="ts">
import VueDraggable from 'vuedraggable';
import type { Client } from '~~/shared/directus';

/**
 * Clients status kanban — 4 columns: Active / Prospect / Inactive / Archived.
 *
 * Drag a card across columns to mutate either `account_state` (active /
 * prospect / inactive) or `status` ("archived" flips status to archived; any
 * other column flips status back to published while owning account_state).
 * Drop ordering inside a column is best-effort visual only — clients use
 * `sort` for explicit ordering and we don't reorder on drop yet.
 */
const props = defineProps<{
	clients: Client[];
	loading?: boolean;
}>();

const emit = defineEmits<{
	(e: 'view', client: Client): void;
	(e: 'update', payload: { id: string; account_state?: Client['account_state']; status?: string }): void;
}>();

type ColumnKey = 'active' | 'prospect' | 'inactive' | 'archived';
const COLUMNS: Array<{ id: ColumnKey; label: string; tone: string }> = [
	{ id: 'active', label: 'Active', tone: 'success' },
	{ id: 'prospect', label: 'Prospect', tone: 'warning' },
	{ id: 'inactive', label: 'Inactive', tone: 'muted' },
	{ id: 'archived', label: 'Archived', tone: 'archived' },
];

const config = useRuntimeConfig();

function getLogoUrl(c: Client): string | null {
	if (!c.logo) return null;
	const fileId = typeof c.logo === 'string' ? c.logo : (c.logo as { id?: string })?.id;
	if (!fileId) return null;
	return `${config.public.assetsUrl}${fileId}?key=avatar`;
}

function getInitial(name?: string | null): string {
	return (name || '?').charAt(0).toUpperCase();
}

function columnForClient(c: Client): ColumnKey {
	if (c.status === 'archived') return 'archived';
	const state = (c.account_state || 'active') as string;
	if (state === 'prospect') return 'prospect';
	if (state === 'inactive') return 'inactive';
	return 'active';
}

// Local mirror so VueDraggable can mutate per-column lists without flicker
// before the parent's fetch refreshes the canonical source.
const local = reactive<Record<ColumnKey, Client[]>>({
	active: [],
	prospect: [],
	inactive: [],
	archived: [],
});

function partition(list: Client[]) {
	const next: Record<ColumnKey, Client[]> = { active: [], prospect: [], inactive: [], archived: [] };
	for (const c of list) next[columnForClient(c)].push(c);
	for (const k of Object.keys(next) as ColumnKey[]) local[k] = next[k];
}

watch(() => props.clients, (next) => partition(next || []), { immediate: true });

function onChange(columnId: ColumnKey, event: { added?: { element: Client } }) {
	const added = event.added?.element;
	if (!added) return;
	if (columnId === 'archived') {
		emit('update', { id: added.id as string, status: 'archived' });
	} else {
		emit('update', {
			id: added.id as string,
			account_state: columnId,
			status: added.status === 'archived' ? 'published' : added.status,
		});
	}
}
</script>

<template>
	<div class="clients-board">
		<div v-if="loading && !clients.length" class="grid grid-cols-4 gap-3">
			<div v-for="col in COLUMNS" :key="col.id" class="ios-card p-3 bg-muted/30 min-h-[400px]">
				<div class="h-4 w-20 bg-muted rounded mb-3 animate-pulse" />
				<div class="space-y-2">
					<div v-for="n in 3" :key="n" class="h-16 rounded-lg bg-muted/60 animate-pulse" />
				</div>
			</div>
		</div>

		<div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
			<div v-for="col in COLUMNS" :key="col.id" class="ios-card overflow-hidden flex flex-col">
				<div
					class="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/30"
					:class="{
						'bg-success/5': col.tone === 'success',
						'bg-warning/5': col.tone === 'warning',
						'bg-muted/30': col.tone === 'muted',
						'bg-zinc-500/5': col.tone === 'archived',
					}"
				>
					<div class="flex items-center gap-2">
						<span
							class="w-2 h-2 rounded-full"
							:class="{
								'bg-success': col.tone === 'success',
								'bg-warning': col.tone === 'warning',
								'bg-neutral-400': col.tone === 'muted',
								'bg-zinc-400': col.tone === 'archived',
							}"
						/>
						<span class="text-xs font-medium">{{ col.label }}</span>
					</div>
					<span class="text-[10px] font-medium text-muted-foreground">{{ local[col.id].length }}</span>
				</div>

				<VueDraggable
					v-model="local[col.id]"
					:group="{ name: 'clients' }"
					item-key="id"
					:delay="120"
					:delay-on-touch-only="true"
					class="flex-1 p-2 space-y-2 min-h-[300px]"
					ghost-class="clients-board__ghost"
					chosen-class="clients-board__chosen"
					drag-class="clients-board__drag"
					@change="(e) => onChange(col.id, e)"
				>
					<template #item="{ element }">
						<button
							type="button"
							class="w-full flex items-center gap-2.5 p-2.5 rounded-lg border border-border/40 bg-card hover:bg-muted/40 transition-colors text-left cursor-grab active:cursor-grabbing"
							@click="emit('view', element)"
						>
							<div class="shrink-0">
								<img
									v-if="getLogoUrl(element)"
									:src="getLogoUrl(element)!"
									:alt="element.name"
									class="w-7 h-7 rounded-md object-contain bg-white"
								/>
								<div
									v-else
									class="w-7 h-7 rounded-md bg-muted/60 flex items-center justify-center text-[11px] font-semibold text-muted-foreground"
								>
									{{ getInitial(element.name) }}
								</div>
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-xs font-medium truncate">{{ element.name }}</p>
								<p v-if="element.website" class="text-[10px] text-muted-foreground truncate">
									{{ element.website.replace(/^https?:\/\//, '') }}
								</p>
							</div>
						</button>
					</template>
				</VueDraggable>
			</div>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.clients-board__ghost {
	@apply opacity-40;
}
.clients-board__chosen {
	@apply ring-2 ring-primary;
}
.clients-board__drag {
	@apply shadow-lg;
}
</style>
