<script setup lang="ts">
/**
 * Page-template editor — configures the running header/footer + page numbers
 * drawn on every exported PDF page (proposals / contracts / invoices). The
 * cover/title page is always skipped so it stays clean. Emits `save` with the
 * normalized template; the parent persists it to `organizations.document_page_template`.
 */
import {
	resolvePageTemplate,
	type DocumentPageTemplate,
} from '~/composables/useDocumentTheme';

const props = defineProps<{
	modelTemplate?: DocumentPageTemplate | Record<string, any> | null;
	/** Org logo URL — shown in the preview + drawn in the exported header. */
	logoUrl?: string | null;
	/** Accent color — tints the preview page number. */
	accent?: string | null;
	saving?: boolean;
}>();

const emit = defineEmits<{
	(e: 'save', payload: Required<DocumentPageTemplate>): void;
}>();

const draft = ref<Required<DocumentPageTemplate>>(resolvePageTemplate(props.modelTemplate));
watch(
	() => props.modelTemplate,
	(v) => { draft.value = resolvePageTemplate(v); },
	{ deep: true },
);

const FORMAT_OPTIONS = [
	{ value: 'n_of_m', label: '2 of 10' },
	{ value: 'n_dash_m', label: '2–10' },
	{ value: 'n', label: '2' },
];

const previewNumber = computed(() => {
	const f = draft.value.page_number_format;
	return f === 'n' ? '2' : f === 'n_dash_m' ? '2–10' : '2 of 10';
});

function onSave() {
	emit('save', { ...draft.value });
}
</script>

<template>
	<div class="ios-card p-5 mt-3">
		<div class="flex items-start justify-between gap-3">
			<div>
				<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
					Page template
				</h3>
				<p class="text-xs text-muted-foreground">
					A running header &amp; footer on every exported PDF page. The title page stays clean.
				</p>
			</div>
			<label class="inline-flex items-center gap-2 shrink-0 cursor-pointer">
				<input v-model="draft.enabled" type="checkbox" class="sr-only peer" />
				<span class="w-9 h-5 rounded-full bg-muted peer-checked:bg-primary relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
			</label>
		</div>

		<div v-if="draft.enabled" class="mt-4 grid gap-4 md:grid-cols-2">
			<!-- Controls -->
			<div class="space-y-3">
				<label class="flex items-center gap-2 text-sm">
					<input v-model="draft.show_logo" type="checkbox" />
					Show organization logo in the header
				</label>

				<div>
					<label class="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Header text (right)</label>
					<input
						v-model="draft.header_text"
						placeholder="e.g. NY / MIAMI · huestudios.com"
						class="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
					/>
				</div>

				<div>
					<label class="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Footer text (left)</label>
					<input
						v-model="draft.footer_text"
						placeholder="e.g. 605 lincoln road · suite 200 · contact@huestudios.com"
						class="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
					/>
				</div>

				<label class="flex items-center gap-2 text-sm">
					<input v-model="draft.show_page_numbers" type="checkbox" />
					Show page numbers
				</label>

				<div v-if="draft.show_page_numbers" class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
					<span>Format</span>
					<div class="flex gap-1">
						<button
							v-for="opt in FORMAT_OPTIONS"
							:key="opt.value"
							class="px-2 py-0.5 rounded border"
							:class="draft.page_number_format === opt.value ? 'border-primary text-primary bg-primary/5' : 'border-border'"
							@click="draft.page_number_format = opt.value as Required<DocumentPageTemplate>['page_number_format']"
						>
							{{ opt.label }}
						</button>
					</div>
				</div>
			</div>

			<!-- Mini page preview -->
			<div class="rounded-lg border border-border bg-white text-black overflow-hidden shadow-sm select-none" :style="{ '--tpl-accent': accent || '#1f2937' }">
				<div class="flex items-center justify-between px-3 py-2 border-b border-black/5">
					<img v-if="draft.show_logo && logoUrl" :src="logoUrl" alt="" class="h-4 w-auto object-contain" />
					<span v-else class="text-[9px] font-bold tracking-tight text-black/70">LOGO</span>
					<span class="text-[8px] tracking-wide text-black/50 truncate max-w-[55%] text-right">{{ draft.header_text || 'header text' }}</span>
				</div>
				<div class="px-3 py-6 space-y-1.5">
					<div class="h-1.5 rounded bg-black/10 w-2/3" />
					<div class="h-1.5 rounded bg-black/10 w-full" />
					<div class="h-1.5 rounded bg-black/10 w-11/12" />
					<div class="h-1.5 rounded bg-black/10 w-5/6" />
					<div class="h-1.5 rounded bg-black/10 w-full" />
				</div>
				<div class="flex items-center justify-between px-3 py-2 border-t border-black/5">
					<span class="text-[8px] tracking-wide text-black/50 truncate max-w-[60%]">{{ draft.footer_text || 'footer text' }}</span>
					<span v-if="draft.show_page_numbers" class="text-[8px] font-semibold" :style="{ color: 'var(--tpl-accent)' }">{{ previewNumber }}</span>
				</div>
			</div>
		</div>

		<div class="mt-4 flex justify-end">
			<EButton size="sm" :ui="{ rounded: 'rounded-full' }" :loading="saving" @click="onSave">
				Save page template
			</EButton>
		</div>
	</div>
</template>
