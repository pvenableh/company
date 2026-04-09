<template>
	<UModal v-model="isOpen">
		<UCard>
			<template #header>
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-semibold">Invite Client User</h3>
					<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="isOpen = false" />
				</div>
			</template>

			<form @submit.prevent="sendInvitation" class="space-y-4">
				<p class="text-sm text-muted-foreground">
					Invite a user to access this organization as a client.
					They will have limited access scoped to <strong>{{ clientName }}</strong>.
				</p>

				<UFormGroup label="Email Address" required>
					<UInput
						v-model="form.email"
						type="email"
						placeholder="client@company.com"
						icon="i-heroicons-envelope"
					/>
				</UFormGroup>

				<div class="rounded-lg bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
					<Icon name="heroicons:information-circle" class="inline w-4 h-4 mr-1" />
					This user will be assigned the <strong>Client</strong> role with access limited to their
					client record, related projects, tickets, and messaging.
				</div>
			</form>

			<template #footer>
				<div class="flex justify-end gap-2">
					<UButton color="gray" variant="ghost" @click="isOpen = false">Cancel</UButton>
					<UButton
						color="primary"
						:loading="sending"
						:disabled="!form.email"
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
const props = defineProps({
	modelValue: { type: Boolean, default: false },
	organizationId: { type: String, required: true },
	clientId: { type: String, required: true },
	clientName: { type: String, default: 'this client' },
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
});

// Reset form when modal opens
watch(isOpen, (val) => {
	if (val) {
		form.value.email = '';
	}
});

async function sendInvitation() {
	if (!form.value.email) return;

	sending.value = true;
	try {
		const result = await $fetch('/api/org/invite-client', {
			method: 'POST',
			body: {
				email: form.value.email,
				organizationId: props.organizationId,
				clientId: props.clientId,
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
