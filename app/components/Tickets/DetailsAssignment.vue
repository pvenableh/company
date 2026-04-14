<template>
	<UiAssignmentPicker
		:modelValue="assignedUsers"
		@update:modelValue="val => emit('update:assignedUsers', val)"
		:users="allUsers"
		label="Assigned To"
		empty-text="No one assigned"
		:multiple="false"
		@added="userId => emit('user-added', userId)"
		@removed="userId => emit('user-removed', userId)"
	/>
</template>

<script setup>
import { useFilteredUsers } from '~/composables/useFilteredUsers';

const props = defineProps({
	organizationId: {
		type: String,
		default: null,
	},
	teamId: {
		type: String,
		default: null,
	},
	assignedUsers: {
		type: Array,
		default: () => [],
	},
});

const emit = defineEmits(['update:assignedUsers', 'user-removed', 'user-added']);

const { filteredUsers, fetchFilteredUsers } = useFilteredUsers();

// Fetch users when org/team changes
watch(
	[() => props.organizationId, () => props.teamId],
	([orgId, teamId]) => {
		if (orgId) {
			fetchFilteredUsers(orgId, teamId);
		}
	},
	{ immediate: true },
);

const allUsers = computed(() => filteredUsers.value || []);
</script>
