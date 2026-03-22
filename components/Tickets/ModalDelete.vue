<template>
	<UModal :model-value="isOpen" @update:model-value="$emit('update:isOpen', $event)">
		<UCard>
			<div class="flex items-center justify-between mb-8">
				<h3 class="text-2xl leading-5 font-thin uppercase tracking-wide">
					Delete
					<br />
					Ticket
				</h3>
			</div>
			<p class="text-sm text-muted-foreground">Are you sure you want to delete this ticket? This action cannot be undone.</p>
			<div class="flex justify-end space-x-2 mt-8">
				<UButton variant="soft" color="gray" @click="handleCancel">Cancel</UButton>
				<UButton color="red" :loading="isLoading" @click="handleDelete">Delete</UButton>
			</div>
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
