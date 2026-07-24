<template>
	<AppsAppBottomSheet
		:model-value="isOpen"
		title="Delete Ticket"
		@update:model-value="$emit('update:isOpen', $event)"
	>
		<p class="text-sm text-muted-foreground">Are you sure you want to delete this ticket? This action cannot be undone.</p>

		<template #footer>
			<span />
			<div class="flex items-center gap-2">
				<EButton variant="soft" color="gray" @click="handleCancel">Cancel</EButton>
				<EButton color="red" :loading="isLoading" @click="handleDelete">Delete</EButton>
			</div>
		</template>
	</AppsAppBottomSheet>
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
