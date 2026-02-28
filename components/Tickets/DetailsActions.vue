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

const { user: sessionUser, loggedIn } = useUserSession();
const currentUser = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const { isAdmin: checkIsAdmin } = useRole();

const hasDeleteAccess = computed(() => {
	const isCreator = currentUser.value.id === props.creatorId;
	const admin = checkIsAdmin(currentUser.value);

	return admin || isCreator;
});

const hasAccess = computed(() => {
	const isCreator = currentUser.value.id === props.creatorId;
	const admin = checkIsAdmin(currentUser.value);
	const isAssigned = props.assignedUserIds.includes(currentUser.value.id);

	return admin || isCreator || isAssigned;
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
