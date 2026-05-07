<template>
	<Teleport to="body">
		<Transition name="modal-fade">
			<div
				v-if="modelValue"
				class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
				@click.self="close"
			>
				<div class="ios-card shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto p-6 space-y-5">
					<!-- Header -->
					<div class="flex items-center justify-between">
						<div>
							<h2 class="font-semibold text-lg flex items-center gap-2">
								<Icon :name="methodMeta.icon" class="w-5 h-5" :class="methodMeta.colorClass" />
								{{ isEdit ? 'Edit Payment' : `Record ${methodMeta.label}` }}
							</h2>
							<p class="text-xs text-muted-foreground mt-0.5">
								Invoice {{ invoice?.invoice_code || '' }}
							</p>
						</div>
						<button class="p-1.5 rounded-md hover:bg-muted text-muted-foreground" @click="close">
							<Icon name="lucide:x" class="w-4 h-4" />
						</button>
					</div>

					<!-- Method (locked except for "other" / edit) -->
					<div v-if="methodIsLocked" class="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
						<span class="font-medium text-foreground">{{ methodMeta.label }}</span> ·
						{{ methodMeta.helper }}
					</div>
					<div v-else class="space-y-1">
						<label class="t-label text-muted-foreground">Method *</label>
						<input
							v-model="form.payment_method"
							type="text"
							placeholder="e.g. Wire transfer, ACH, money order…"
							class="w-full rounded-lg border bg-background px-3 py-2 text-sm"
						/>
					</div>

					<!-- Amount + Date -->
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1">
							<label class="t-label text-muted-foreground">Amount *</label>
							<div class="relative">
								<span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
								<input
									v-model.number="form.amount"
									type="number"
									step="0.01"
									min="0"
									class="w-full rounded-lg border bg-background pl-6 pr-3 py-2 text-sm tabular-nums"
								/>
							</div>
							<p v-if="remainingBalance > 0 && !isEdit" class="text-[10px] text-muted-foreground">
								Remaining: ${{ formatAmount(remainingBalance) }}
							</p>
						</div>
						<div class="space-y-1">
							<label class="t-label text-muted-foreground">Date Received *</label>
							<input
								v-model="form.date_received"
								type="date"
								class="w-full rounded-lg border bg-background px-3 py-2 text-sm"
							/>
						</div>
					</div>

					<!-- Reference (per-method label) -->
					<div v-if="referenceLabel" class="space-y-1">
						<label class="t-label text-muted-foreground">
							{{ referenceLabel }} <span v-if="referenceRequired">*</span>
						</label>
						<input
							v-model="form.reference"
							type="text"
							:placeholder="referencePlaceholder"
							class="w-full rounded-lg border bg-background px-3 py-2 text-sm"
						/>
					</div>

					<!-- Note -->
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Note</label>
						<textarea
							v-model="form.note"
							rows="2"
							placeholder="Optional internal note…"
							class="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none"
						/>
					</div>

					<!-- Image upload -->
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">{{ imageLabel }}</label>
						<div v-if="imagePreview" class="mb-2 flex items-center gap-2">
							<a :href="imagePreview" target="_blank" class="flex items-center gap-2 text-xs text-primary hover:underline">
								<img :src="imagePreview" alt="Attachment" class="h-10 w-16 object-cover rounded border" />
								<span>View</span>
							</a>
							<button type="button" class="text-xs text-destructive hover:underline" @click="form.check_image = null">Remove</button>
						</div>
						<input
							type="file"
							accept="image/*,application/pdf"
							class="w-full rounded-lg border bg-background px-3 py-2 text-xs file:mr-2 file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:text-primary"
							:disabled="uploading"
							@change="handleImageUpload"
						/>
						<p v-if="uploading" class="text-[10px] text-muted-foreground">Uploading…</p>
					</div>

					<!-- Deposit date (checks only) -->
					<div v-if="effectiveMethod === 'check'" class="space-y-1">
						<label class="t-label text-muted-foreground">Deposit Date</label>
						<input
							v-model="form.deposit_date"
							type="date"
							class="w-full rounded-lg border bg-background px-3 py-2 text-sm"
						/>
						<p class="text-[10px] text-muted-foreground">Optional — set when you actually deposit the check.</p>
					</div>

					<!-- Error -->
					<div v-if="error" class="rounded-lg bg-destructive/10 text-destructive text-xs px-3 py-2">
						{{ error }}
					</div>

					<!-- Actions -->
					<div class="flex justify-end gap-2 pt-1">
						<button
							class="text-sm px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted"
							:disabled="saving"
							@click="close"
						>
							Cancel
						</button>
						<button
							class="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
							:disabled="!canSubmit"
							@click="handleSubmit"
						>
							<Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 animate-spin" />
							<Icon v-else name="lucide:check" class="w-4 h-4" />
							{{ saving ? 'Saving…' : isEdit ? 'Save changes' : 'Record payment' }}
						</button>
					</div>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<script setup lang="ts">
import type { Invoice, PaymentsReceived } from '~~/shared/directus';

type MethodKey = 'check' | 'zelle' | 'venmo' | 'cash' | 'other' | 'edit';

const props = defineProps<{
	modelValue: boolean;
	invoice: Invoice | null;
	method: MethodKey;
	payment?: PaymentsReceived | null;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: boolean];
	saved: [];
}>();

const isEdit = computed(() => props.method === 'edit');
const methodIsLocked = computed(() => !isEdit.value && props.method !== 'other');
const effectiveMethod = computed<string>(() => {
	if (isEdit.value) return (props.payment?.payment_method || '').toLowerCase();
	return props.method;
});

const methodMeta = computed(() => {
	const map: Record<string, { label: string; icon: string; colorClass: string; helper: string }> = {
		check: {
			label: 'Check',
			icon: 'lucide:square-check-big',
			colorClass: 'text-emerald-600',
			helper: 'Physical check received from the client.',
		},
		zelle: {
			label: 'Zelle',
			icon: 'lucide:send',
			colorClass: 'text-violet-600',
			helper: 'Zelle bank transfer.',
		},
		venmo: {
			label: 'Venmo',
			icon: 'lucide:smartphone',
			colorClass: 'text-sky-500',
			helper: 'Venmo payment.',
		},
		cash: {
			label: 'Cash',
			icon: 'lucide:banknote',
			colorClass: 'text-amber-600',
			helper: 'Cash payment.',
		},
		other: {
			label: 'Other Payment',
			icon: 'lucide:wallet',
			colorClass: 'text-muted-foreground',
			helper: 'Anything not covered above (wire, ACH, money order, etc.).',
		},
		edit: {
			label: 'Edit Payment',
			icon: 'lucide:pencil',
			colorClass: 'text-muted-foreground',
			helper: '',
		},
	};
	return map[props.method] || map.other;
});

const referenceLabel = computed(() => {
	switch (effectiveMethod.value) {
		case 'check': return 'Check #';
		case 'zelle': return 'Confirmation #';
		case 'venmo': return 'Handle / Confirmation';
		case 'cash': return null;
		default: return 'Reference';
	}
});

const referenceRequired = computed(() => effectiveMethod.value === 'check');

const referencePlaceholder = computed(() => {
	switch (effectiveMethod.value) {
		case 'check': return 'e.g. 1042';
		case 'zelle': return 'Confirmation code';
		case 'venmo': return '@username or confirmation';
		default: return 'Optional';
	}
});

const imageLabel = computed(() => {
	switch (effectiveMethod.value) {
		case 'check': return 'Check Image';
		case 'zelle':
		case 'venmo': return 'Confirmation Screenshot';
		default: return 'Attachment';
	}
});

// ── Form state ─────────────────────────────────────────────
const form = reactive<{
	amount: number;
	date_received: string;
	reference: string;
	note: string;
	check_image: string | null;
	deposit_date: string;
	payment_method: string;
}>({
	amount: 0,
	date_received: new Date().toISOString().slice(0, 10),
	reference: '',
	note: '',
	check_image: null,
	deposit_date: '',
	payment_method: '',
});

const remainingBalance = computed(() => {
	if (!props.invoice) return 0;
	const total = Number(props.invoice.total_amount || 0);
	const paid = ((props.invoice.payments as any[]) || [])
		.filter(p => p?.status === 'paid')
		.reduce((sum, p) => sum + Number(p?.amount || 0), 0);
	return Math.max(0, Math.round((total - paid) * 100) / 100);
});

watch(
	() => props.modelValue,
	(open) => {
		if (!open) return;
		// Reset/seed when opening
		if (isEdit.value && props.payment) {
			const p = props.payment;
			form.amount = Number(p.amount || 0);
			form.date_received = (p.date_received || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
			form.reference = p.reference || '';
			form.note = p.note || '';
			form.check_image = typeof p.check_image === 'object' ? (p.check_image as any)?.id || null : (p.check_image as any) || null;
			form.deposit_date = (p.deposit_date || '').slice(0, 10);
			form.payment_method = p.payment_method || '';
		} else {
			form.amount = remainingBalance.value > 0 ? remainingBalance.value : Number(props.invoice?.total_amount || 0);
			form.date_received = new Date().toISOString().slice(0, 10);
			form.reference = '';
			form.note = '';
			form.check_image = null;
			form.deposit_date = '';
			form.payment_method = props.method === 'other' ? '' : props.method;
		}
		error.value = null;
	},
);

// ── File upload ────────────────────────────────────────────
const { upload: uploadFile, getUrl: getFileUrl } = useDirectusFiles();
const { getOrgSubfolder } = useOrgFolders();
const uploading = ref(false);

const imagePreview = computed(() => {
	if (!form.check_image) return null;
	return getFileUrl(form.check_image, { width: 200, format: 'webp' });
});

async function handleImageUpload(e: Event) {
	const input = e.target as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return;
	uploading.value = true;
	try {
		const folder = await getOrgSubfolder('Financials');
		const uploaded = await uploadFile(file, {
			title: `Payment ${methodMeta.value.label} - ${props.invoice?.invoice_code || ''}`,
			...(folder && { folder }),
		});
		form.check_image = (uploaded as any)?.id || null;
	} catch (err) {
		console.warn('Upload failed:', err);
	} finally {
		uploading.value = false;
	}
}

// ── Submit ─────────────────────────────────────────────────
const saving = ref(false);
const error = ref<string | null>(null);

const canSubmit = computed(() => {
	if (saving.value) return false;
	if (!form.amount || form.amount <= 0) return false;
	if (!form.date_received) return false;
	if (referenceRequired.value && !form.reference.trim()) return false;
	if (props.method === 'other' && !form.payment_method.trim()) return false;
	return true;
});

const toast = useToast();

async function handleSubmit() {
	if (!canSubmit.value || !props.invoice) return;
	saving.value = true;
	error.value = null;
	try {
		const payload: Record<string, any> = {
			amount: form.amount,
			date_received: form.date_received,
			reference: form.reference.trim() || null,
			note: form.note.trim() || null,
			check_image: form.check_image,
			deposit_date: form.deposit_date || null,
		};
		if (isEdit.value) {
			payload.payment_method = form.payment_method;
			await $fetch(`/api/invoices/${props.invoice.id}/payments/${props.payment!.id}`, {
				method: 'PATCH',
				body: payload,
			});
		} else {
			payload.payment_method = props.method === 'other'
				? form.payment_method.trim()
				: props.method;
			await $fetch(`/api/invoices/${props.invoice.id}/payments`, {
				method: 'POST',
				body: payload,
			});
		}
		toast.add({
			title: isEdit.value ? 'Payment updated' : 'Payment recorded',
			color: 'green',
		});
		emit('saved');
		close();
	} catch (e: any) {
		error.value = e?.data?.message || e?.message || 'Failed to save payment';
	} finally {
		saving.value = false;
	}
}

function close() {
	emit('update:modelValue', false);
}

function formatAmount(value: number): string {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
}
</script>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
	transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
	opacity: 0;
}
</style>
