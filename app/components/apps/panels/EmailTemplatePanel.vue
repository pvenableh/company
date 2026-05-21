<!--
	EmailTemplatePanel — slide-over wrapper around the full-page
	NewsletterBlockBuilder editor (block palette + canvas + preview pane
	+ AI wizard + HTML import/export).

	Closes the two punch-outs to the legacy email template editor route
	from `/apps/marketing` (openEmailTemplate helper + NewEmailSheet) so
	the editor lives inside the universal slide-over stack instead of
	route-navigating out of the apps shell.

	Architectural fit:
		- Hosted in fullscreen mode (AppSlideOverShell.fullscreen) — the
			editor legitimately owns its full chrome and would be crushed by
			the default 42rem panel column. The stack's `:has()` rule lifts
			the max-width clamp when this shell is mounted.
		- BlockBuilder receives `hostedInPanel` so its top-left back chevron
			emits `close` (we pop the stack) instead of NuxtLinking to /email.
		- `mode='ai'` on the slide URL maps to `autoOpenAi=true` so the
			"Earnest Generate" flow from NewEmailSheet still auto-opens the
			AI wizard on first paint.

	Deep-link receiver: `/email/templates/[id].vue` is kept alive as a
	thin route wrapper for emailed/shared URLs (unauthenticated link-share
	preview, copy-link affordances). New navigations from inside /apps/*
	go through this panel.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const templateId = computed(() => Number(props.id));
const autoOpenAI = computed(() => props.mode === 'ai');

const { getTemplate } = useEmailTemplates();

const template = ref<any>(null);
const loading = ref(true);
const loadError = ref(false);

async function loadTemplate(id: number) {
	loading.value = true;
	loadError.value = false;
	try {
		template.value = await getTemplate(id);
	} catch (e) {
		console.warn('[EmailTemplatePanel] Failed to load template', id, e);
		loadError.value = true;
	} finally {
		loading.value = false;
	}
}

onMounted(() => loadTemplate(templateId.value));
watch(templateId, (next) => {
	if (Number.isFinite(next)) loadTemplate(next);
});
</script>

<template>
	<AppSlideOverShell fullscreen @close="emit('close')">
		<div v-if="loading" class="h-full w-full flex items-center justify-center">
			<div class="text-center">
				<div class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
				<p class="text-xs text-muted-foreground">Loading template…</p>
			</div>
		</div>
		<div v-else-if="loadError || !template" class="h-full w-full flex items-center justify-center">
			<div class="text-center">
				<Icon name="lucide:alert-circle" class="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
				<p class="text-sm text-muted-foreground mb-4">Template not found</p>
				<button
					type="button"
					class="rounded-full px-4 py-2 text-[10px] font-medium uppercase tracking-wide border border-border bg-card hover:bg-muted ios-press transition-colors inline-flex items-center gap-1.5"
					@click="emit('close')"
				>
					<Icon name="lucide:chevron-left" class="w-3 h-3" />
					Close
				</button>
			</div>
		</div>
		<NewsletterBlockBuilder
			v-else
			:template-id="templateId"
			:template="template"
			:auto-open-ai="autoOpenAI"
			hosted-in-panel
			@close="emit('close')"
		/>
	</AppSlideOverShell>
</template>
