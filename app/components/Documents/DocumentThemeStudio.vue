<script setup lang="ts">
import { DOC_FONT_STACKS } from '~/composables/useDocumentTheme';
import type { DocumentTheme, DocumentThemeConfig } from '~/composables/useDocumentTheme';

/**
 * DocumentThemeStudio — a visual editor for the org's document look. Controls
 * on one side, a live DocumentShell preview on the other. Emits `save` with the
 * chosen base theme, accent, and customization config; the parent persists it.
 */

const props = defineProps<{
	theme?: string | null;
	accent?: string | null;
	config?: DocumentThemeConfig | Record<string, any> | null;
	saving?: boolean;
}>();

const emit = defineEmits<{
	(e: 'save', payload: { theme: DocumentTheme; accent: string; config: DocumentThemeConfig }): void;
}>();

const BASE_THEMES = [
	{ value: 'classic', label: 'Classic', desc: 'Clean white card, sans-serif.' },
	{ value: 'editorial', label: 'Editorial', desc: 'Warm cream paper, serif body.' },
	{ value: 'mono', label: 'Mono', desc: 'Minimal, accent-driven.' },
] as const;

const FONT_OPTIONS = Object.entries(DOC_FONT_STACKS).map(([value, v]) => ({ value, label: v.label }));

// --- Draft state (local until saved) ---
const draftTheme = ref<DocumentTheme>((props.theme as DocumentTheme) || 'classic');
const draftAccent = ref<string>(props.accent || '#1f2937');
const draftConfig = reactive<DocumentThemeConfig>({
	bg: undefined,
	fg: undefined,
	rule: undefined,
	headingFont: undefined,
	bodyFont: undefined,
	metaTransform: undefined,
	metaTracking: undefined,
	cardRadius: undefined,
});

function hydrate() {
	draftTheme.value = (props.theme as DocumentTheme) || 'classic';
	draftAccent.value = props.accent || '#1f2937';
	const c = (props.config || {}) as DocumentThemeConfig;
	draftConfig.bg = c.bg;
	draftConfig.fg = c.fg;
	draftConfig.rule = c.rule;
	draftConfig.headingFont = c.headingFont;
	draftConfig.bodyFont = c.bodyFont;
	draftConfig.metaTransform = c.metaTransform;
	draftConfig.metaTracking = c.metaTracking;
	draftConfig.cardRadius = c.cardRadius;
}
hydrate();
watch(() => [props.theme, props.accent, props.config], hydrate);

// Toggles for whether each override is "on" (advanced customization). When off
// we omit the field so the base theme's own value shows through.
const useBg = ref(!!draftConfig.bg);
const useFg = ref(!!draftConfig.fg);
const useRadius = ref(typeof draftConfig.cardRadius === 'number');

// The config passed to the live preview — only include enabled overrides.
const previewConfig = computed<DocumentThemeConfig>(() => {
	const out: DocumentThemeConfig = {};
	if (useBg.value && draftConfig.bg) out.bg = draftConfig.bg;
	if (useFg.value && draftConfig.fg) out.fg = draftConfig.fg;
	if (draftConfig.rule) out.rule = draftConfig.rule;
	if (draftConfig.headingFont) out.headingFont = draftConfig.headingFont;
	if (draftConfig.bodyFont) out.bodyFont = draftConfig.bodyFont;
	if (draftConfig.metaTransform) out.metaTransform = draftConfig.metaTransform;
	if (typeof draftConfig.metaTracking === 'number') out.metaTracking = draftConfig.metaTracking;
	if (useRadius.value && typeof draftConfig.cardRadius === 'number') out.cardRadius = draftConfig.cardRadius;
	return out;
});

const previewSeller = computed(() => ({
	name: 'Your Studio',
	document_theme: draftTheme.value,
	document_accent: draftAccent.value,
}));

function reset() {
	draftConfig.bg = undefined;
	draftConfig.fg = undefined;
	draftConfig.rule = undefined;
	draftConfig.headingFont = undefined;
	draftConfig.bodyFont = undefined;
	draftConfig.metaTransform = undefined;
	draftConfig.metaTracking = undefined;
	draftConfig.cardRadius = undefined;
	useBg.value = false;
	useFg.value = false;
	useRadius.value = false;
}

function onSave() {
	emit('save', {
		theme: draftTheme.value,
		accent: draftAccent.value,
		config: previewConfig.value,
	});
}
</script>

<template>
	<div class="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-6">
		<!-- Controls -->
		<div class="space-y-5">
			<!-- Base theme -->
			<div>
				<label class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Base theme</label>
				<div class="mt-2 grid grid-cols-1 gap-1.5">
					<button
						v-for="t in BASE_THEMES"
						:key="t.value"
						type="button"
						class="text-left rounded-lg border px-3 py-2 transition-all flex items-center gap-3"
						:class="draftTheme === t.value
							? 'border-primary ring-2 ring-primary/20 bg-primary/5'
							: 'border-border hover:border-primary/40 hover:bg-muted/40'"
						@click="draftTheme = t.value"
					>
						<span
							class="h-8 w-8 shrink-0 rounded doc-shell"
							:class="`doc-theme--${t.value}`"
							:style="t.value === 'mono' ? { '--doc-accent-color': draftAccent } : {}"
						>
							<span class="block h-full w-full rounded" :style="`background: var(--doc-bg); border: 1px solid var(--doc-rule)`"></span>
						</span>
						<span class="min-w-0">
							<span class="block font-medium text-xs">{{ t.label }}</span>
							<span class="block text-[10px] text-muted-foreground leading-snug">{{ t.desc }}</span>
						</span>
					</button>
				</div>
			</div>

			<!-- Accent -->
			<div>
				<label class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Accent color</label>
				<div class="mt-2 flex items-center gap-2">
					<input v-model="draftAccent" type="color" class="h-8 w-10 rounded cursor-pointer border border-border" />
					<input v-model="draftAccent" type="text" class="glass-field h-8 px-2 text-xs rounded-full w-24 font-mono" placeholder="#1f2937" />
				</div>
			</div>

			<!-- Typography -->
			<div class="grid grid-cols-1 gap-3">
				<div>
					<label class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Heading font</label>
					<select v-model="draftConfig.headingFont" class="glass-field mt-1.5 h-8 w-full text-xs rounded-full px-3">
						<option :value="undefined">Theme default</option>
						<option v-for="f in FONT_OPTIONS" :key="f.value" :value="f.value">{{ f.label }}</option>
					</select>
				</div>
				<div>
					<label class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Body font</label>
					<select v-model="draftConfig.bodyFont" class="glass-field mt-1.5 h-8 w-full text-xs rounded-full px-3">
						<option :value="undefined">Theme default</option>
						<option v-for="f in FONT_OPTIONS" :key="f.value" :value="f.value">{{ f.label }}</option>
					</select>
				</div>
			</div>

			<!-- Eyebrow / meta styling -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Labels</label>
					<select v-model="draftConfig.metaTransform" class="glass-field mt-1.5 h-8 w-full text-xs rounded-full px-3">
						<option :value="undefined">Theme default</option>
						<option value="uppercase">UPPERCASE</option>
						<option value="none">As typed</option>
					</select>
				</div>
				<div>
					<label class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Tracking</label>
					<input
						v-model.number="draftConfig.metaTracking"
						type="number" step="0.01" min="0" max="0.3" placeholder="0.06"
						class="glass-field mt-1.5 h-8 w-full text-xs rounded-full px-3 font-mono"
					/>
				</div>
			</div>

			<!-- Surface overrides -->
			<div class="space-y-2.5 pt-1 border-t border-border">
				<div class="flex items-center justify-between">
					<label class="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
						<input v-model="useBg" type="checkbox" class="rounded border-border" /> Custom background
					</label>
					<input v-if="useBg" v-model="draftConfig.bg" type="color" class="h-7 w-9 rounded cursor-pointer border border-border" />
				</div>
				<div class="flex items-center justify-between">
					<label class="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
						<input v-model="useFg" type="checkbox" class="rounded border-border" /> Custom text color
					</label>
					<input v-if="useFg" v-model="draftConfig.fg" type="color" class="h-7 w-9 rounded cursor-pointer border border-border" />
				</div>
				<div class="flex items-center justify-between gap-3">
					<label class="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-2 shrink-0">
						<input v-model="useRadius" type="checkbox" class="rounded border-border" /> Corner radius
					</label>
					<input
						v-if="useRadius"
						v-model.number="draftConfig.cardRadius"
						type="range" min="0" max="24" step="1"
						class="flex-1 accent-primary"
					/>
					<span v-if="useRadius" class="text-[10px] font-mono text-muted-foreground w-8 text-right">{{ draftConfig.cardRadius ?? 0 }}px</span>
				</div>
			</div>

			<!-- Actions -->
			<div class="flex items-center justify-between pt-2 border-t border-border">
				<button type="button" class="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2" @click="reset">
					Reset customization
				</button>
				<EButton size="sm" color="primary" :loading="saving" @click="onSave">Save theme</EButton>
			</div>
		</div>

		<!-- Live preview -->
		<div class="rounded-xl border border-border bg-muted/30 p-4 sm:p-6 overflow-auto">
			<div class="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
				<span class="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
				Live preview
			</div>
			<DocumentsDocumentShell
				:seller="previewSeller"
				:theme-override="draftTheme"
				:accent-override="draftAccent"
				:config-override="previewConfig"
				wrapper-class="p-6 sm:p-8 max-w-xl mx-auto"
			>
				<!-- Seller / eyebrow -->
				<div class="doc__seller border-b pb-4 mb-6" style="border-color: var(--doc-rule)">
					<p class="doc__meta text-[11px]" style="color: var(--doc-muted)">{{ previewSeller.name }}</p>
					<p class="doc__meta text-[11px]" style="color: var(--doc-muted)">Proposal · #EX-0042</p>
				</div>
				<!-- Cover title -->
				<h1 class="doc__title doc__cover-title text-2xl sm:text-3xl font-semibold mb-1">Brand Refresh & Website</h1>
				<p class="doc__cover-recipient text-sm mb-8" style="color: var(--doc-muted)">Prepared for Acme Co.</p>

				<!-- A heading block -->
				<h3 class="doc__block-heading mb-2">Scope of Work</h3>
				<div class="prose text-sm mb-6" style="color: var(--doc-fg)">
					<p>A focused engagement covering brand identity, a responsive marketing site, and a launch playbook. Each phase ships reviewable work so you always know where things stand.</p>
				</div>

				<h3 class="doc__block-heading mb-2">Investment</h3>
				<div class="flex items-center justify-between text-sm py-2" style="border-bottom: 1px solid var(--doc-rule)">
					<span>Brand identity system</span><span class="font-medium">$6,500</span>
				</div>
				<div class="flex items-center justify-between text-sm py-2" style="border-bottom: 1px solid var(--doc-rule)">
					<span>Marketing website</span><span class="font-medium">$12,000</span>
				</div>
				<div class="doc__total-rule flex items-center justify-between text-sm pt-3 mt-1 font-semibold">
					<span>Total</span><span style="color: var(--doc-accent)">$18,500</span>
				</div>
			</DocumentsDocumentShell>
		</div>
	</div>
</template>
