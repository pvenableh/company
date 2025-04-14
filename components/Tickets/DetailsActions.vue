<template>
	<div class="flex flex-row items-center justify-end space-x-2">
		<div class="space-x-2">
			<UButton variant="soft" color="red" :loading="isLoading" @click="confirmDelete" :disabled="!hasDeleteAccess">
				Delete
			</UButton>
			<UButton
				:disabled="!hasAccess"
				type="submit"
				color="primary"
				:loading="isLoading"
				:variant="isDirty ? 'solid' : 'outline'"
				class="transition-all"
				:class="{ 'animate-pulse': isDirty }"
			>
				Save
			</UButton>
		</div>
	</div>
</template>

<script setup>
const props = defineProps({
	ticketId: {
		type: String,
		required: true,
	},
	ticketTitle: {
		type: String,
		required: true,
	},
	creatorId: {
		type: String,
		required: true,
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

const emit = defineEmits(['delete-click', 'share']);

const { data, status } = useAuth();
const currentUser = computed(() => {
	return status.value === 'authenticated' ? data?.value?.user ?? null : null;
});
const config = useRuntimeConfig();
const adminRole = config.public.adminRole;

const hasDeleteAccess = computed(() => {
	const isCreator = currentUser.value.id === props.creatorId;
	const isAdmin = currentUser.value.role === adminRole;

	return isAdmin || isCreator;
});

const hasAccess = computed(() => {
	const isCreator = currentUser.value.id === props.creatorId;
	const isAdmin = currentUser.value.role === adminRole;
	const isAssigned = props.assignedUserIds.includes(currentUser.value.id);

	return isAdmin || isCreator || isAssigned;
});

function confirmDelete() {
	if (!hasDeleteAccess.value) {
		useToast().add({
			title: 'Warning',
			description: "You don't have access to delete this ticket.",
			color: 'red',
		});
	} else {
		emit('delete-click');
	}
}

function handleShare(method) {
	emit('share', method);
}
</script>
