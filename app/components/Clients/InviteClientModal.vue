<template>
	<UModal v-model="isOpen" title="Invite Client User">
		<form @submit.prevent="sendInvitation" class="space-y-4">
			<p class="text-sm text-muted-foreground">
				Invite a user to access this organization as a client.
				<template v-if="resolvedClientName">
					They will have limited access scoped to <strong>{{ resolvedClientName }}</strong>.
				</template>
				<template v-else>
					Pick the client company to scope their access.
				</template>
			</p>

			<UFormGroup v-if="!props.clientId" label="Client Company" required>
				<USelectMenu
					v-model="form.clientId"
					:options="clientOptions"
					value-attribute="id"
					option-attribute="name"
					placeholder="Select a client…"
					:loading="clientsLoading"
				/>
			</UFormGroup>

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
			<div class="flex justify-end">
				<UiActionButton
					icon="lucide:send"
					variant="primary"
					:loading="sending"
					:disabled="!canSubmit"
					@click="sendInvitation"
				>
					Send Invitation
				</UiActionButton>
			</div>
		</template>
	</UModal>
</template>

<script setup>
const props = defineProps({
	modelValue: { type: Boolean, default: false },
	organizationId: { type: String, required: true },
	/** Pre-scoped client. Omit to render a client picker. */
	clientId: { type: String, default: null },
	clientName: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue', 'invited']);

const toast = useToast();
const sending = ref(false);

const clientItems = useDirectusItems('clients');
const clients = ref([]);
const clientsLoading = ref(false);

const isOpen = computed({
	get: () => props.modelValue,
	set: (val) => emit('update:modelValue', val),
});

const form = ref({
	email: '',
	clientId: props.clientId || null,
});

const clientOptions = computed(() => clients.value);

const resolvedClientName = computed(() => {
	if (props.clientId) return props.clientName || 'this client';
	if (!form.value.clientId) return '';
	return clients.value.find((c) => c.id === form.value.clientId)?.name || '';
});

const canSubmit = computed(() => !!form.value.email && !!(props.clientId || form.value.clientId));

async function loadClients() {
	if (props.clientId) return;
	clientsLoading.value = true;
	try {
		clients.value = await clientItems.list({
			filter: { organization: { _eq: props.organizationId } },
			fields: ['id', 'name'],
			sort: ['name'],
			limit: -1,
		});
	} finally {
		clientsLoading.value = false;
	}
}

watch(isOpen, (val) => {
	if (val) {
		form.value.email = '';
		form.value.clientId = props.clientId || null;
		if (!props.clientId && !clients.value.length) loadClients();
	}
});

async function sendInvitation() {
	if (!canSubmit.value) return;

	sending.value = true;
	try {
		const result = await $fetch('/api/org/invite-client', {
			method: 'POST',
			body: {
				email: form.value.email,
				organizationId: props.organizationId,
				clientId: props.clientId || form.value.clientId,
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
