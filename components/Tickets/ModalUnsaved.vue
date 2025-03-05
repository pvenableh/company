<template>
	<UModal :model-value="isOpen" @update:model-value="$emit('update:isOpen', $event)">
		<UCard>
			<div class="flex items-center justify-between mb-8">
				<h3 class="text-2xl leading-5 font-thin uppercase tracking-wide">Unsaved Changes</h3>
			</div>
			<p class="text-sm text-gray-500">You have unsaved changes. Would you like to save them before leaving?</p>
			<div class="flex justify-end space-x-2 mt-8">
				<UButton variant="soft" color="gray" @click="handleDiscard">Discard</UButton>
				<UButton color="primary" :loading="isLoading" @click="handleSave">Save</UButton>
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

const emit = defineEmits(['update:isOpen', 'save', 'discard']);

function handleSave() {
	emit('save');
}

function handleDiscard() {
	emit('discard');
}
</script>
