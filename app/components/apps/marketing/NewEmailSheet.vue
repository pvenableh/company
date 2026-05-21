<!--
  NewEmailSheet — bottom sheet for creating a new email template.

  Mirrors the two-step modal from the legacy email landing (method
  picker → name/source picker) but as an `<AppsAppBottomSheet>`. On
  create, opens the EmailTemplatePanel (fullscreen slide-over hosting
  NewsletterBlockBuilder) so the editor lives inside the apps shell
  instead of route-navigating out to `/email/templates/[id]`. Replaces
  the two header / empty-state punch-outs that previously dumped the
  user on the legacy landing page two hops before the create flow.
-->
<script setup lang="ts">
import AppBottomSheet from '../AppBottomSheet.vue';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const { getTemplates, getStarterTemplates, createTemplate, duplicateTemplate } = useEmailTemplates();
const emailTemplateSlide = useAppSlideOver('email-template');

type StartMethod = 'blank' | 'existing' | 'starter' | 'ai';
const startMethod = ref<StartMethod | null>(null);
const newTemplateName = ref('');
const newTemplateType = ref<'newsletter' | 'transactional'>('newsletter');
const selectedSourceTemplate = ref<any>(null);
const creating = ref(false);

const templates = ref<any[]>([]);
const starterTemplates = ref<any[]>([]);

// Load picker data lazily — once on first open.
const dataLoaded = ref(false);
async function ensureDataLoaded() {
	if (dataLoaded.value) return;
	dataLoaded.value = true;
	try {
		const [tpls, starters] = await Promise.all([
			getTemplates().catch(() => []),
			getStarterTemplates().catch(() => []),
		]);
		templates.value = tpls;
		starterTemplates.value = starters;
	} catch {
		templates.value = [];
		starterTemplates.value = [];
	}
}

watch(
	() => props.modelValue,
	(open) => {
		if (open) {
			ensureDataLoaded();
		} else {
			// Reset on close so the next open starts at step 1.
			startMethod.value = null;
			newTemplateName.value = '';
			selectedSourceTemplate.value = null;
			newTemplateType.value = 'newsletter';
		}
	},
);

function close() {
	emit('update:modelValue', false);
}

function pickMethod(m: StartMethod) {
	startMethod.value = m;
	selectedSourceTemplate.value = null;
}

function backToMethods() {
	startMethod.value = null;
	selectedSourceTemplate.value = null;
}

async function handleCreate() {
	if (!newTemplateName.value.trim()) return;
	creating.value = true;
	try {
		if ((startMethod.value === 'existing' || startMethod.value === 'starter') && selectedSourceTemplate.value) {
			const tpl = await duplicateTemplate(
				selectedSourceTemplate.value.id,
				newTemplateName.value.trim(),
			);
			close();
			emailTemplateSlide.open(String(tpl.id));
		} else {
			const tpl = await createTemplate({
				name: newTemplateName.value.trim(),
				type: newTemplateType.value,
				status: 'draft',
			});
			close();
			emailTemplateSlide.open(String(tpl.id), startMethod.value === 'ai' ? 'ai' : undefined);
		}
	} catch {
		close();
	} finally {
		creating.value = false;
	}
}

const sheetTitle = computed(() => {
	if (!startMethod.value) return 'Create Email';
	if (startMethod.value === 'existing') return 'From Existing';
	if (startMethod.value === 'starter') return 'Start from Template';
	if (startMethod.value === 'ai') return 'Earnest Generate';
	return 'New Template';
});

const sheetSubtitle = computed(() => {
	if (!startMethod.value) return 'Pick how you want to start';
	if (startMethod.value === 'blank') return 'Name it and start with an empty canvas';
	if (startMethod.value === 'ai') return 'Describe your email, Earnest builds it';
	return null;
});

const canSubmit = computed(() => {
	if (!newTemplateName.value.trim()) return false;
	if ((startMethod.value === 'existing' || startMethod.value === 'starter') && !selectedSourceTemplate.value) return false;
	return true;
});
</script>

<template>
	<AppBottomSheet
		:model-value="modelValue"
		:title="sheetTitle"
		:subtitle="sheetSubtitle ?? ''"
		@update:model-value="emit('update:modelValue', $event)"
	>
		<!-- Step 1: pick start method -->
		<div v-if="!startMethod" class="space-y-1">
			<button
				type="button"
				class="flex items-center gap-3 w-full px-3 py-3 text-left rounded-xl hover:bg-muted/40 ios-press transition-colors"
				@click="pickMethod('blank')"
			>
				<div class="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
					<Icon name="lucide:file-plus" class="w-4 h-4 text-muted-foreground" />
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-foreground">Blank Template</p>
					<p class="text-[11px] text-muted-foreground">Start from scratch</p>
				</div>
				<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40" />
			</button>
			<button
				v-if="starterTemplates.length > 0"
				type="button"
				class="flex items-center gap-3 w-full px-3 py-3 text-left rounded-xl hover:bg-muted/40 ios-press transition-colors"
				@click="pickMethod('starter')"
			>
				<div class="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
					<Icon name="lucide:layout-template" class="w-4 h-4 text-success" />
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-foreground">Start from Template</p>
					<p class="text-[11px] text-muted-foreground">
						{{ starterTemplates.length }} pre-built {{ starterTemplates.length === 1 ? 'design' : 'designs' }}
					</p>
				</div>
				<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40" />
			</button>
			<button
				type="button"
				class="flex items-center gap-3 w-full px-3 py-3 text-left rounded-xl hover:bg-muted/40 ios-press transition-colors disabled:opacity-40"
				:disabled="templates.length === 0"
				@click="pickMethod('existing')"
			>
				<div class="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
					<Icon name="lucide:copy" class="w-4 h-4 text-blue-500" />
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-foreground">From Existing</p>
					<p class="text-[11px] text-muted-foreground">Duplicate &amp; customize a template</p>
				</div>
				<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40" />
			</button>
			<button
				type="button"
				class="flex items-center gap-3 w-full px-3 py-3 text-left rounded-xl hover:bg-muted/40 ios-press transition-colors"
				@click="pickMethod('ai')"
			>
				<div class="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
					<EarnestIcon class="w-4 h-4 text-violet-500" />
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-foreground">Earnest Generate</p>
					<p class="text-[11px] text-muted-foreground">Describe your email, Earnest builds it</p>
				</div>
				<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground/40" />
			</button>
		</div>

		<!-- Step 2a: blank / AI — name + type -->
		<div v-else-if="startMethod === 'blank' || startMethod === 'ai'" class="space-y-4">
			<div>
				<label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Template Name</label>
				<input
					v-model="newTemplateName"
					type="text"
					placeholder="e.g. March Newsletter, Welcome Email…"
					class="w-full rounded-xl border bg-background px-3 py-2.5 text-sm focus:ring-1 focus:ring-primary/30 outline-none transition-all"
					@keyup.enter="handleCreate"
				>
			</div>
			<div>
				<label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Type</label>
				<div class="bg-muted/40 rounded-full p-0.5 flex gap-0.5 w-fit">
					<button
						type="button"
						class="rounded-full px-3.5 py-1.5 text-[11px] font-medium transition-all"
						:class="newTemplateType === 'newsletter' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'"
						@click="newTemplateType = 'newsletter'"
					>
						Newsletter
					</button>
					<button
						type="button"
						class="rounded-full px-3.5 py-1.5 text-[11px] font-medium transition-all"
						:class="newTemplateType === 'transactional' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'"
						@click="newTemplateType = 'transactional'"
					>
						Transactional
					</button>
				</div>
			</div>
		</div>

		<!-- Step 2b: starter picker -->
		<div v-else-if="startMethod === 'starter'" class="space-y-3">
			<div class="rounded-xl border border-border/40 divide-y divide-border/30 overflow-hidden max-h-64 overflow-y-auto">
				<button
					v-for="tpl in starterTemplates"
					:key="tpl.id"
					type="button"
					class="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors ios-press"
					:class="{ 'bg-primary/5': selectedSourceTemplate?.id === tpl.id }"
					@click="selectedSourceTemplate = tpl; newTemplateName = tpl.name"
				>
					<div class="w-7 h-7 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
						<Icon name="lucide:layout-template" class="w-3.5 h-3.5 text-success" />
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-foreground truncate">{{ tpl.name }}</p>
						<p class="text-[10px] text-muted-foreground capitalize">{{ tpl.block_count || 0 }} blocks · {{ tpl.type }}</p>
					</div>
					<Icon v-if="selectedSourceTemplate?.id === tpl.id" name="lucide:check" class="w-4 h-4 text-primary" />
				</button>
			</div>
			<div v-if="selectedSourceTemplate">
				<label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Name Your Copy</label>
				<input
					v-model="newTemplateName"
					type="text"
					class="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:ring-1 focus:ring-primary/30 outline-none transition-all"
					@keyup.enter="handleCreate"
				>
			</div>
		</div>

		<!-- Step 2c: existing picker -->
		<div v-else-if="startMethod === 'existing'" class="space-y-3">
			<div class="rounded-xl border border-border/40 divide-y divide-border/30 overflow-hidden max-h-64 overflow-y-auto">
				<button
					v-for="tpl in templates"
					:key="tpl.id"
					type="button"
					class="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors ios-press"
					:class="{ 'bg-primary/5': selectedSourceTemplate?.id === tpl.id }"
					@click="selectedSourceTemplate = tpl; newTemplateName = `${tpl.name} (Copy)`"
				>
					<div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :class="tpl.type === 'newsletter' ? 'bg-primary/5' : 'bg-blue-500/5'">
						<Icon :name="tpl.type === 'newsletter' ? 'lucide:newspaper' : 'lucide:mail'" class="w-3.5 h-3.5" :class="tpl.type === 'newsletter' ? 'text-primary/60' : 'text-blue-500/60'" />
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-foreground truncate">{{ tpl.name }}</p>
						<p class="text-[10px] text-muted-foreground capitalize">{{ tpl.type }}</p>
					</div>
					<Icon v-if="selectedSourceTemplate?.id === tpl.id" name="lucide:check" class="w-4 h-4 text-primary" />
				</button>
			</div>
			<div v-if="selectedSourceTemplate">
				<label class="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">New Name</label>
				<input
					v-model="newTemplateName"
					type="text"
					class="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:ring-1 focus:ring-primary/30 outline-none transition-all"
					@keyup.enter="handleCreate"
				>
			</div>
		</div>

		<template #footer>
			<div class="flex items-center justify-between gap-2">
				<button
					v-if="startMethod"
					type="button"
					class="rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 ios-press transition-colors inline-flex items-center gap-1"
					@click="backToMethods"
				>
					<Icon name="lucide:chevron-left" class="w-3 h-3" />
					Back
				</button>
				<span v-else />
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="rounded-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/60 ios-press transition-colors"
						@click="close"
					>
						Cancel
					</button>
					<button
						v-if="startMethod"
						type="button"
						class="rounded-full px-4 py-1.5 text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 ios-press shadow-sm transition-colors inline-flex items-center gap-1.5 disabled:opacity-40"
						:disabled="!canSubmit || creating"
						@click="handleCreate"
					>
						<EarnestIcon v-if="startMethod === 'ai'" class="w-3 h-3" />
						<Icon v-else-if="startMethod === 'existing' || startMethod === 'starter'" name="lucide:copy" class="w-3 h-3" />
						{{ creating ? 'Creating…' : startMethod === 'ai' ? 'Create & Generate' : (startMethod === 'existing' || startMethod === 'starter') ? 'Duplicate' : 'Create' }}
					</button>
				</div>
			</div>
		</template>
	</AppBottomSheet>
</template>
