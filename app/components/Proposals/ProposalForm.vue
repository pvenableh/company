<template>
	<form @submit.prevent="handleSubmit" class="space-y-5">
		<!-- Mode toggle: draft a new one vs. log an existing/historical proposal.
		     Only offered on create — editing keeps whatever the record is. -->
		<div v-if="!isEditing" class="flex items-center gap-1 rounded-full bg-muted/50 p-1 text-xs">
			<button
				type="button"
				class="flex-1 rounded-full px-3 py-1.5 font-medium transition-colors"
				:class="mode === 'new' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
				@click="mode = 'new'"
			>
				Draft new
			</button>
			<button
				type="button"
				class="flex-1 rounded-full px-3 py-1.5 font-medium transition-colors"
				:class="mode === 'log' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
				@click="mode = 'log'"
			>
				Log existing
			</button>
		</div>

		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Title *</label>
			<EInput v-model="form.title" placeholder="Proposal title" required />
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Total Value</label>
				<EInput v-model="form.total_value" type="number" step="0.01" placeholder="0.00" icon="i-heroicons-currency-dollar" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Valid Until</label>
				<EInput v-model="form.valid_until" type="date" />
			</div>

			<!-- Historical fields — only when logging an already-sent proposal. -->
			<template v-if="isLogging">
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Status</label>
					<ESelect v-model="form.proposal_status" :options="statusOptions" value-attribute="value" option-attribute="label" />
				</div>
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Date Sent</label>
					<EInput v-model="form.date_sent" type="date" />
				</div>
			</template>
		</div>

		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Internal notes</label>
			<ETextarea v-model="form.notes" :rows="3" placeholder="Private notes — not shown on the rendered proposal" />
		</div>

		<!-- PDF / document attachment — the whole point of logging an existing one. -->
		<div v-if="isLogging" class="space-y-1">
			<label class="t-label text-muted-foreground">Attach PDF</label>
			<input ref="fileInput" type="file" class="hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,image/*" @change="onFileSelected" />
			<div
				v-if="!selectedFile"
				class="flex items-center gap-2 rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-3 text-xs text-muted-foreground cursor-pointer hover:border-muted-foreground/50 transition-colors"
				@click="pickFile"
			>
				<Icon name="lucide:paperclip" class="w-4 h-4 shrink-0" />
				<span>Attach the signed / sent PDF (optional). This won't open the block composer.</span>
			</div>
			<div v-else class="flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/40 px-3 py-2.5 text-xs">
				<Icon name="lucide:file-text" class="w-4 h-4 shrink-0 text-muted-foreground" />
				<span class="flex-1 truncate font-medium">{{ selectedFile.name }}</span>
				<span class="text-muted-foreground shrink-0">{{ prettySize(selectedFile.size) }}</span>
				<button type="button" class="text-muted-foreground hover:text-destructive shrink-0" @click="clearFile">
					<Icon name="lucide:x" class="w-3.5 h-3.5" />
				</button>
			</div>
		</div>

		<div v-if="!isEditing && !isLogging" class="rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 px-3 py-2 flex items-start gap-2 text-xs text-muted-foreground">
			<Icon name="lucide:layout-template" class="w-4 h-4 mt-0.5 shrink-0" />
			<span>After saving, you'll land in the block composer to add scope, pricing, and signatures.</span>
		</div>
	</form>
</template>

<script setup lang="ts">
import { PROPOSAL_STATUS_LABELS } from '~~/shared/proposals-enhanced';

const props = defineProps<{
	proposal?: any;
	leadId?: number | string;
	saving?: boolean;
}>();

const isEditing = computed(() => !!props.proposal?.id);

// 'new' = draft in the composer (default). 'log' = record an existing proposal
// (usually already sent/accepted) and attach its PDF, skipping the composer.
const mode = ref<'new' | 'log'>('new');
const isLogging = computed(() => !isEditing.value && mode.value === 'log');

const statusOptions = Object.entries(PROPOSAL_STATUS_LABELS).map(([value, label]) => ({ value, label }));

const emit = defineEmits<{
	submit: [data: any];
}>();

const form = reactive({
	title: props.proposal?.title || '',
	total_value: props.proposal?.total_value || '',
	valid_until: props.proposal?.valid_until || '',
	date_sent: props.proposal?.date_sent || '',
	proposal_status: props.proposal?.proposal_status || 'sent',
	notes: props.proposal?.notes || '',
	organization: props.proposal?.organization?.id || props.proposal?.organization || null,
	contact: props.proposal?.contact?.id || props.proposal?.contact || null,
	lead: props.proposal?.lead?.id || props.proposal?.lead || props.leadId || null,
});

// Raw File kept out of the reactive form payload; handed to the modal separately.
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
function pickFile() { fileInput.value?.click(); }
function onFileSelected(e: Event) {
	const input = e.target as HTMLInputElement;
	selectedFile.value = input.files?.[0] || null;
}
function clearFile() {
	selectedFile.value = null;
	if (fileInput.value) fileInput.value.value = '';
}
function prettySize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function handleSubmit() {
	emit('submit', {
		title: form.title,
		notes: form.notes,
		organization: form.organization,
		contact: form.contact,
		lead: form.lead,
		// Coerce empty strings to null for numeric/date columns — Postgres rejects ""
		total_value: form.total_value === '' || form.total_value == null ? null : Number(form.total_value),
		valid_until: form.valid_until || null,
		// Logging metadata consumed by FormModal — status + sent date come from the
		// user here rather than defaulting to 'draft', and _logExisting tells the
		// modal to skip the composer redirect.
		_logExisting: isLogging.value,
		_file: isLogging.value ? selectedFile.value : null,
		...(isLogging.value
			? { proposal_status: form.proposal_status, date_sent: form.date_sent || null }
			: {}),
	});
}

defineExpose({
	triggerSubmit: handleSubmit,
	hasTitle: computed(() => !!form.title?.trim()),
});
</script>
