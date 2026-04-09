<template>
	<UModal :model-value="isOpen" @update:model-value="$emit('update:isOpen', $event)">
		<UCard>
			<template #header>
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-semibold">Delete Ticket</h3>
				</div>
			</template>

			<p class="text-sm text-muted-foreground">Are you sure you want to delete this ticket? This action cannot be undone.</p>

			<template #footer>
				<div class="flex justify-end gap-2">
					<UButton variant="soft" color="gray" @click="handleCancel">Cancel</UButton>
					<UButton color="red" :loading="isLoading" @click="handleDelete">Delete</UButton>
				</div>
			</template>
		</UCard>
	</UModal>
</template>

<script setup>
const props = defineProps({
	isOpen: {
		type: Boolean,
		default: false,
	},
	isLoading: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['update:isOpen', 'delete', 'cancel']);
const { feedback } = useFeedback();

function handleDelete() {
	feedback('heavy');
	emit('delete');
}

function handleCancel() {
	emit('cancel');
	emit('update:isOpen', false);
}
</script>
