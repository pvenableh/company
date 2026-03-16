<template>
	<div class="flex items-center justify-between pt-4 border-t border-border mt-6">
		<div class="flex items-center gap-2">
			<UTooltip text="Delete ticket">
				<UButton
					color="red"
					variant="ghost"
					icon="i-heroicons-trash"
					size="sm"
					@click="emit('deleteClick')"
				/>
			</UTooltip>
			<UTooltip text="Share ticket">
				<UButton
					color="gray"
					variant="ghost"
					icon="i-heroicons-share"
					size="sm"
					@click="emit('share', 'link')"
				/>
			</UTooltip>
		</div>

		<Button
			type="submit"
			size="sm"
			:disabled="isLoading || !isDirty"
		>
			<UIcon v-if="isLoading" name="i-heroicons-arrow-path" class="animate-spin h-3.5 w-3.5 mr-1" />
			Save Changes
		</Button>
	</div>
</template>

<script setup>
import { Button } from '~/components/ui/button';

defineProps({
	ticketId: {
		type: String,
		required: true,
	},
	ticketTitle: {
		type: String,
		default: '',
	},
	creatorId: {
		type: String,
		default: null,
	},
	assignedUserIds: {
		type: Array,
		default: () => [],
	},
	isLoading: {
		type: Boolean,
		default: false,
	},
	isDirty: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['deleteClick', 'share']);
</script>
