<script setup lang="ts">
/**
 * grouped_list — labelled groups of bullet items. Mirrors the Hue HUE-605
 * "client experience." page (orange group labels, dash-bulleted lists).
 */
import type { GroupedListPayload, GroupedListGroup } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: GroupedListPayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: GroupedListPayload];
}>();

function uid(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
	return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const payload = computed<GroupedListPayload>(() => ({
	heading: props.modelValue?.heading ?? '',
	columns: props.modelValue?.columns || 1,
	groups: Array.isArray(props.modelValue?.groups) ? props.modelValue.groups : [],
}));

function patch(p: Partial<GroupedListPayload>) {
	emit('update:modelValue', { ...payload.value, ...p });
}

function setGroups(groups: GroupedListGroup[]) {
	patch({ groups });
}

function addGroup() {
	setGroups([...payload.value.groups, { id: uid(), label: '', items: [''] }]);
}
function removeGroup(gi: number) {
	setGroups(payload.value.groups.filter((_, i) => i !== gi));
}
function updateGroup(gi: number, p: Partial<GroupedListGroup>) {
	const next = payload.value.groups.map((g, i) => (i === gi ? { ...g, ...p } : g));
	setGroups(next);
}
function updateItem(gi: number, ii: number, value: string) {
	const items = payload.value.groups[gi].items.slice();
	items[ii] = value;
	updateGroup(gi, { items });
}
function addItem(gi: number) {
	updateGroup(gi, { items: [...payload.value.groups[gi].items, ''] });
}
function removeItem(gi: number, ii: number) {
	updateGroup(gi, { items: payload.value.groups[gi].items.filter((_, i) => i !== ii) });
}
function onItemKeydown(e: KeyboardEvent, gi: number, ii: number) {
	if (e.key === 'Enter') {
		e.preventDefault();
		const items = payload.value.groups[gi].items.slice();
		items.splice(ii + 1, 0, '');
		updateGroup(gi, { items });
	} else if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '' && payload.value.groups[gi].items.length > 1) {
		e.preventDefault();
		removeItem(gi, ii);
	}
}

const COLUMN_OPTIONS = [1, 2, 3];
</script>

<template>
	<div class="space-y-2">
		<input
			:value="payload.heading || ''"
			placeholder="Section heading (optional) — e.g. client experience."
			class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm font-semibold"
			@input="patch({ heading: ($event.target as HTMLInputElement).value })"
		/>

		<div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
			<span>Columns</span>
			<div class="flex gap-1">
				<button
					v-for="c in COLUMN_OPTIONS"
					:key="c"
					class="px-2 py-0.5 rounded border"
					:class="(payload.columns || 1) === c ? 'border-primary text-primary bg-primary/5' : 'border-border'"
					@click="patch({ columns: c as GroupedListPayload['columns'] })"
				>
					{{ c }}
				</button>
			</div>
		</div>

		<div v-for="(group, gi) in payload.groups" :key="group.id" class="rounded-lg border border-border p-2 space-y-1.5">
			<div class="flex items-center gap-2">
				<input
					:value="group.label || ''"
					placeholder="Group label — e.g. Global Brands:"
					class="flex-1 bg-transparent border-0 outline-none text-sm font-semibold"
					@input="updateGroup(gi, { label: ($event.target as HTMLInputElement).value })"
				/>
				<button class="p-1 rounded hover:bg-destructive/10 text-destructive" title="Remove group" @click="removeGroup(gi)">
					<EIcon name="lucide:trash-2" class="w-3.5 h-3.5" />
				</button>
			</div>
			<ul class="space-y-1 pl-1">
				<li v-for="(item, ii) in group.items" :key="ii" class="flex items-center gap-1.5 group/item">
					<span class="text-muted-foreground">–</span>
					<input
						:value="item"
						placeholder="Item"
						class="flex-1 bg-transparent border-0 outline-none text-sm"
						@input="updateItem(gi, ii, ($event.target as HTMLInputElement).value)"
						@keydown="onItemKeydown($event, gi, ii)"
					/>
					<button
						class="p-0.5 rounded hover:bg-destructive/10 text-destructive opacity-0 group-hover/item:opacity-100"
						@click="removeItem(gi, ii)"
					>
						<EIcon name="lucide:x" class="w-3.5 h-3.5" />
					</button>
				</li>
			</ul>
			<button class="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" @click="addItem(gi)">
				<EIcon name="lucide:plus" class="w-3.5 h-3.5" /> Add item
			</button>
		</div>

		<button
			class="w-full rounded-lg border-2 border-dashed border-border p-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5"
			@click="addGroup"
		>
			<EIcon name="lucide:plus" class="w-3.5 h-3.5" /> Add group
		</button>
	</div>
</template>
