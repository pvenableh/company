<template>
	<UModal v-model="isOpen" class="sm:max-w-sm">
		<template #header>
			<div class="flex items-center justify-between w-full">
				<h3 class="text-sm font-bold uppercase tracking-wide">Mark Lead as Lost</h3>
				<Button variant="ghost" size="icon-sm" @click="handleCancel">
					<UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
				</Button>
			</div>
		</template>

		<form @submit.prevent="handleSubmit" class="space-y-4 p-4">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Why was this lead lost? *</label>
				<UTextarea
					v-model="form.lost_reason"
					:rows="3"
					placeholder="e.g. Budget constraints, went with competitor, timing not right..."
				/>
			</div>

			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Closed Date</label>
				<UInput v-model="form.closed_date" type="date" />
			</div>
		</form>

		<template #footer>
			<div class="flex items-center gap-1">
				<Button
					size="sm"
					variant="destructive"
					:disabled="saving || !form.lost_reason.trim()"
					@click="handleSubmit"
				>
					<Icon v-if="saving" name="lucide:loader-2" class="h-3.5 w-3.5 mr-1 animate-spin" />
					<Icon v-else name="lucide:x-circle" class="h-3.5 w-3.5 mr-1" />
					Mark Lost
				</Button>
			</div>
		</template>
	</UModal>
</template>

<script setup>
import { Button } from '~/components/ui/button';

const props = defineProps({
	lead: { type: Object, default: null },
});

const emit = defineEmits(['lost', 'cancelled']);

const isOpen = defineModel({ default: false });
const saving = ref(false);

const { markLeadLost } = useLeads();
const { triggerRefresh } = useLeadsStore();
const toast = useToast();

const form = reactive({
	lost_reason: '',
	closed_date: '',
});

watch(isOpen, (val) => {
	if (val) {
		form.lost_reason = '';
		form.closed_date = new Date().toISOString().split('T')[0];
	}
});

function handleCancel() {
	isOpen.value = false;
	emit('cancelled');
}

async function handleSubmit() {
	if (!form.lost_reason.trim()) return;
	saving.value = true;

	try {
		await markLeadLost(
			props.lead.id,
			form.lost_reason.trim(),
			form.closed_date ? new Date(form.closed_date).toISOString() : undefined,
			props.lead.stage,
		);

		toast.add({ title: 'Lead marked as lost', color: 'yellow' });
		triggerRefresh();
		emit('lost');
		isOpen.value = false;
	} catch (err) {
		console.error('Failed to mark lead as lost:', err);
		toast.add({ title: 'Failed to update lead', description: err.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>
