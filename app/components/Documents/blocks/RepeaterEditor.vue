<script setup lang="ts">
/**
 * repeater — a heading + a repeating list of simple items (title, subtitle,
 * body, optional image). Drives the Hue HUE-605 "team." and "references."
 * pages: title = name, subtitle = role, body = bio / contact details.
 */
import type { RepeaterPayload, RepeaterItem } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: RepeaterPayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: RepeaterPayload];
}>();

function uid(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
	return `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const payload = computed<RepeaterPayload>(() => ({
	heading: props.modelValue?.heading ?? '',
	layout: props.modelValue?.layout || 'row',
	items: Array.isArray(props.modelValue?.items) ? props.modelValue.items : [],
}));

function patch(p: Partial<RepeaterPayload>) {
	emit('update:modelValue', { ...payload.value, ...p });
}
function setItems(items: RepeaterItem[]) {
	patch({ items });
}
function addItem() {
	setItems([...payload.value.items, { id: uid(), title: '', subtitle: '', body_markdown: '', image_url: '' }]);
}
function removeItem(i: number) {
	setItems(payload.value.items.filter((_, idx) => idx !== i));
}
function updateItem(i: number, p: Partial<RepeaterItem>) {
	setItems(payload.value.items.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
}
function move(i: number, dir: -1 | 1) {
	const j = i + dir;
	if (j < 0 || j >= payload.value.items.length) return;
	const next = payload.value.items.slice();
	[next[i], next[j]] = [next[j], next[i]];
	setItems(next);
}

const LAYOUT_OPTIONS = [
	{ value: 'row', label: 'Stacked' },
	{ value: 'card', label: 'Cards' },
];
</script>

<template>
	<div class="space-y-2">
		<input
			:value="payload.heading || ''"
			placeholder="Section heading (optional) — e.g. team."
			class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm font-semibold"
			@input="patch({ heading: ($event.target as HTMLInputElement).value })"
		/>

		<div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
			<span>Layout</span>
			<div class="flex gap-1">
				<button
					v-for="opt in LAYOUT_OPTIONS"
					:key="opt.value"
					class="px-2 py-0.5 rounded border"
					:class="(payload.layout || 'row') === opt.value ? 'border-primary text-primary bg-primary/5' : 'border-border'"
					@click="patch({ layout: opt.value as RepeaterPayload['layout'] })"
				>
					{{ opt.label }}
				</button>
			</div>
		</div>

		<div v-for="(item, i) in payload.items" :key="item.id" class="rounded-lg border border-border p-2 space-y-1.5">
			<div class="flex items-center gap-2">
				<input
					:value="item.title || ''"
					placeholder="Title — e.g. Camila Hoffman"
					class="flex-1 bg-transparent border-0 outline-none text-sm font-semibold"
					@input="updateItem(i, { title: ($event.target as HTMLInputElement).value })"
				/>
				<div class="flex items-center gap-0.5 text-muted-foreground">
					<button class="p-1 rounded hover:bg-muted disabled:opacity-30" :disabled="i === 0" title="Move up" @click="move(i, -1)">
						<EIcon name="lucide:chevron-up" class="w-3.5 h-3.5" />
					</button>
					<button class="p-1 rounded hover:bg-muted disabled:opacity-30" :disabled="i === payload.items.length - 1" title="Move down" @click="move(i, 1)">
						<EIcon name="lucide:chevron-down" class="w-3.5 h-3.5" />
					</button>
					<button class="p-1 rounded hover:bg-destructive/10 text-destructive" title="Remove" @click="removeItem(i)">
						<EIcon name="lucide:trash-2" class="w-3.5 h-3.5" />
					</button>
				</div>
			</div>
			<input
				:value="item.subtitle || ''"
				placeholder="Subtitle — e.g. creative director / creative lead"
				class="w-full bg-transparent border-0 outline-none text-sm text-muted-foreground"
				@input="updateItem(i, { subtitle: ($event.target as HTMLInputElement).value })"
			/>
			<textarea
				:value="item.body_markdown || ''"
				placeholder="Body (markdown supported)"
				rows="3"
				class="w-full bg-transparent border-0 outline-none resize-y text-sm leading-relaxed"
				@input="updateItem(i, { body_markdown: ($event.target as HTMLTextAreaElement).value })"
			/>
			<input
				:value="item.image_url || ''"
				placeholder="Image URL (optional)"
				class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-0.5 text-xs text-muted-foreground"
				@input="updateItem(i, { image_url: ($event.target as HTMLInputElement).value })"
			/>
		</div>

		<button
			class="w-full rounded-lg border-2 border-dashed border-border p-2 text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5"
			@click="addItem"
		>
			<EIcon name="lucide:plus" class="w-3.5 h-3.5" /> Add item
		</button>
	</div>
</template>
