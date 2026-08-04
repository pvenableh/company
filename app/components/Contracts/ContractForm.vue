<template>
	<form @submit.prevent="handleSubmit" class="space-y-5">
		<!-- Draft a fresh contract vs. log an existing/signed one (create only). -->
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
			<EInput v-model="form.title" placeholder="Contract title" required />
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Total Value</label>
				<EInput v-model="form.total_value" type="number" step="0.01" placeholder="0.00" icon="i-heroicons-currency-dollar" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Effective Date</label>
				<EInput v-model="form.effective_date" type="date" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Date Sent</label>
				<EInput v-model="form.date_sent" type="date" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Valid Until</label>
				<EInput v-model="form.valid_until" type="date" />
			</div>

			<!-- Status only matters when logging an already-executed contract. -->
			<div v-if="isLogging" class="space-y-1 sm:col-span-2">
				<label class="t-label text-muted-foreground">Status</label>
				<ESelect v-model="form.contract_status" :options="statusOptions" value-attribute="value" option-attribute="label" />
			</div>
		</div>

		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Internal Notes</label>
			<ETextarea v-model="form.notes" :rows="3" placeholder="Notes (not rendered to the client)" />
		</div>

		<!-- Signed / sent PDF upload for logged contracts. -->
		<div v-if="isLogging" class="space-y-1">
			<label class="t-label text-muted-foreground">Attach PDF</label>
			<input ref="fileInput" type="file" class="hidden" accept=".pdf,.doc,.docx,image/*" @change="onFileSelected" />
			<div
				v-if="!selectedFile"
				class="flex items-center gap-2 rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-3 text-xs text-muted-foreground cursor-pointer hover:border-muted-foreground/50 transition-colors"
				@click="pickFile"
			>
				<Icon name="lucide:paperclip" class="w-4 h-4 shrink-0" />
				<span>Attach the signed / executed PDF (optional). This won't open the block composer.</span>
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
			<span>After saving, you'll land in the block composer to add scope, fees, and signatures.</span>
		</div>
	</form>
</template>

<script setup lang="ts">
import { CONTRACT_STATUS_LABELS } from '~~/shared/contracts';

const props = defineProps<{
	contract?: any;
	leadId?: number | string | null;
	proposalId?: string | null;
	saving?: boolean;
}>();

const isEditing = computed(() => !!props.contract?.id);

const mode = ref<'new' | 'log'>('new');
const isLogging = computed(() => !isEditing.value && mode.value === 'log');

const statusOptions = Object.entries(CONTRACT_STATUS_LABELS).map(([value, label]) => ({ value, label }));

const emit = defineEmits<{
	submit: [data: any];
}>();

const form = reactive({
	title: props.contract?.title || '',
	total_value: props.contract?.total_value || '',
	date_sent: props.contract?.date_sent || '',
	valid_until: props.contract?.valid_until || '',
	effective_date: props.contract?.effective_date || '',
	contract_status: props.contract?.contract_status || 'signed',
	notes: props.contract?.notes || '',
	contact: props.contract?.contact?.id || props.contract?.contact || null,
	lead: props.contract?.lead?.id || props.contract?.lead || props.leadId || null,
	proposal: props.contract?.proposal?.id || props.contract?.proposal || props.proposalId || null,
});

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
		contact: form.contact,
		lead: form.lead,
		proposal: form.proposal,
		total_value: form.total_value === '' || form.total_value == null ? null : Number(form.total_value),
		date_sent: form.date_sent || null,
		valid_until: form.valid_until || null,
		effective_date: form.effective_date || null,
		_logExisting: isLogging.value,
		_file: isLogging.value ? selectedFile.value : null,
		...(isLogging.value ? { contract_status: form.contract_status } : {}),
	});
}

defineExpose({
	triggerSubmit: handleSubmit,
	hasTitle: computed(() => !!form.title?.trim()),
});
</script>
