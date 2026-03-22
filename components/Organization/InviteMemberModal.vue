<template>
	<UModal v-model="isOpen">
		<UCard>
			<template #header>
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-semibold">Invite Member</h3>
					<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="isOpen = false" />
				</div>
			</template>

			<form @submit.prevent="sendInvitation" class="space-y-4">
				<p class="text-sm text-muted-foreground">
					Invite a new team member to join this organization. They will receive an email with instructions to accept.
				</p>

				<UFormGroup label="Email Address" required>
					<UInput
						v-model="form.email"
						type="email"
						placeholder="user@example.com"
						icon="i-heroicons-envelope"
					/>
				</UFormGroup>

				<UFormGroup label="Role" required>
					<USelect
						v-model="form.roleId"
						:options="availableRoles"
						option-attribute="label"
						value-attribute="value"
						placeholder="Select a role"
					/>
					<p v-if="selectedRoleDescription" class="text-xs text-muted-foreground mt-1">
						{{ selectedRoleDescription }}
					</p>
				</UFormGroup>
			</form>

			<template #footer>
				<div class="flex justify-end gap-2">
					<UButton color="gray" variant="ghost" @click="isOpen = false">Cancel</UButton>
					<UButton
						color="primary"
						:loading="sending"
						:disabled="!form.email || !form.roleId"
						@click="sendInvitation"
					>
						Send Invitation
					</UButton>
				</div>
			</template>
		</UCard>
	</UModal>
</template>

<script setup>
import { ROLE_METADATA } from '~/types/permissions';

const props = defineProps({
	modelValue: { type: Boolean, default: false },
	organizationId: { type: String, required: true },
	roles: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:modelValue', 'invited']);

const toast = useToast();
const sending = ref(false);

const isOpen = computed({
	get: () => props.modelValue,
	set: (val) => emit('update:modelValue', val),
});

const form = ref({
	email: '',
	roleId: '',
});

// Filter out owner role — can't invite owners
const availableRoles = computed(() => {
	return props.roles
		.filter((r) => r.slug !== 'owner')
		.map((r) => ({
			label: r.name,
			value: r.id,
			slug: r.slug,
		}));
});

const selectedRoleDescription = computed(() => {
	const role = props.roles.find((r) => r.id === form.value.roleId);
	if (!role) return '';
	return ROLE_METADATA[role.slug]?.description || '';
});

// Auto-select first non-owner role
watch(
	() => availableRoles.value,
	(roles) => {
		if (roles.length && !form.value.roleId) {
			// Default to 'member' if available, otherwise first
			const memberRole = roles.find((r) => r.slug === 'member');
			form.value.roleId = memberRole?.value || roles[0].value;
		}
	},
	{ immediate: true }
);

// Reset form when modal opens
watch(isOpen, (val) => {
	if (val) {
		form.value.email = '';
		// Keep roleId as default
	}
});

async function sendInvitation() {
	if (!form.value.email || !form.value.roleId) return;

	sending.value = true;
	try {
		const result = await $fetch('/api/org/invite-member', {
			method: 'POST',
			body: {
				email: form.value.email,
				organizationId: props.organizationId,
				roleId: form.value.roleId,
			},
		});

		toast.add({
			title: 'Invitation Sent',
			description: result.message,
			color: 'green',
		});

		isOpen.value = false;
		emit('invited');
	} catch (error) {
		const message = error?.data?.message || error?.message || 'Failed to send invitation';
		toast.add({ title: 'Error', description: message, color: 'red' });
	} finally {
		sending.value = false;
	}
}
</script>
