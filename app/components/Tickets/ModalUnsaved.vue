<template>
	<EModal :model-value="isOpen" @update:model-value="$emit('update:isOpen', $event)">
		<template #header>
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-semibold">Unsaved Changes</h3>
			</div>
		</template>

		<p class="text-sm text-muted-foreground">You have unsaved changes. Would you like to save them before leaving?</p>

		<template #footer>
			<div class="flex justify-end gap-2">
				<EButton variant="soft" color="gray" @click="handleDiscard">Discard</EButton>
				<EButton color="primary" :loading="isLoading" @click="handleSave">Save</EButton>
			</div>
		</template>
	</EModal>
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
