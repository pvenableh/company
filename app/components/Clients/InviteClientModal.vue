<template>
	<UModal v-model="isOpen" title="Invite Client User" :ui="{ width: 'sm:max-w-lg' }">
		<div class="space-y-4">
			<p class="text-sm text-muted-foreground">
				<template v-if="resolvedClientName">
					Grant portal access scoped to <strong>{{ resolvedClientName }}</strong>.
				</template>
				<template v-else>
					Pick a client below, then choose a contact or enter an email.
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

			<!-- Tab strip -->
			<div class="flex gap-1 p-1 bg-muted/40 rounded-lg w-fit">
				<button
					type="button"
					class="px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors"
					:class="tab === 'contact' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
					@click="tab = 'contact'"
				>
					<Icon name="lucide:user" class="inline w-3 h-3 mr-1" />
					Pick a Contact
				</button>
				<button
					type="button"
					class="px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors"
					:class="tab === 'email' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
					@click="tab = 'email'"
				>
					<Icon name="lucide:at-sign" class="inline w-3 h-3 mr-1" />
					Invite by Email
				</button>
			</div>

			<!-- Contact picker -->
			<div v-if="tab === 'contact'" class="space-y-3">
				<UInput
					v-model="contactQuery"
					placeholder="Search contacts by name or email…"
					icon="i-heroicons-magnifying-glass"
					:disabled="!resolvedClientId"
				/>

				<div v-if="!resolvedClientId" class="text-xs text-muted-foreground text-center py-6">
					Select a client to load contacts.
				</div>
				<div v-else-if="candidatesLoading" class="text-xs text-muted-foreground text-center py-6">
					Loading contacts…
				</div>
				<div v-else-if="!filteredCandidates.length" class="text-xs text-muted-foreground text-center py-6">
					{{ contactQuery ? 'No contacts match your search.' : 'No contacts in this organization yet.' }}
				</div>
				<div v-else class="max-h-72 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
					<button
						v-for="c in filteredCandidates"
						:key="c.id"
						type="button"
						class="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
						:class="[
							c.accessStatus === 'direct'
								? 'opacity-60 cursor-not-allowed bg-muted/20'
								: 'hover:bg-muted/40 cursor-pointer',
							selectedContactId === c.id && c.accessStatus !== 'direct' && 'bg-primary/10',
						]"
						:disabled="c.accessStatus === 'direct'"
						@click="onPickContact(c)"
					>
						<div class="size-8 rounded-full bg-muted flex items-center justify-center shrink-0 text-[11px] font-semibold text-muted-foreground overflow-hidden">
							<img v-if="contactPhotoUrl(c)" :src="contactPhotoUrl(c)" :alt="contactDisplayName(c)" class="size-8 object-cover" />
							<span v-else>{{ contactInitials(c) }}</span>
						</div>
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium truncate">{{ contactDisplayName(c) }}</p>
							<p class="text-[11px] text-muted-foreground/70 truncate">
								{{ c.email || 'No email on file' }}<template v-if="c.title"> · {{ c.title }}</template>
							</p>
						</div>
						<span
							v-if="c.accessStatus === 'direct'"
							class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
						>
							<Icon name="lucide:check" class="w-2.5 h-2.5" />
							Has access
						</span>
						<span
							v-else-if="c.accessStatus === 'inherited'"
							class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 bg-sky-500/15 text-sky-600 dark:text-sky-400"
							:title="`Inherited via ${c.inheritedFromName ?? 'parent'}`"
						>
							<Icon name="lucide:link-2" class="w-2.5 h-2.5" />
							Via {{ c.inheritedFromName ?? 'parent' }}
						</span>
					</button>
				</div>

				<div
					v-if="selectedContact"
					class="rounded-lg bg-muted/40 px-3 py-2 text-xs flex items-start gap-2"
				>
					<Icon name="lucide:info" class="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
					<div>
						<p>
							Inviting <strong>{{ contactDisplayName(selectedContact) }}</strong>
							<template v-if="!selectedContact.email"> — but this contact has no email on file. Add an email to the contact first.</template>
						</p>
						<p v-if="selectedContact.accessStatus === 'inherited'" class="mt-1 text-muted-foreground">
							They already see {{ resolvedClientName || 'this client' }} via
							<strong>{{ selectedContact.inheritedFromName ?? 'parent' }}</strong>.
							Adding direct access keeps them in if {{ selectedContact.inheritedFromName ?? 'the parent' }}'s access is later revoked.
						</p>
					</div>
				</div>
			</div>

			<!-- Email entry -->
			<div v-else class="space-y-3">
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
					A new Contact will be created and tied to {{ resolvedClientName || 'the selected client' }}. The user gets an
					email invite with portal access scoped to that client.
				</div>
			</div>
		</div>

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

const config = useRuntimeConfig();
const toast = useToast();
const sending = ref(false);

const clientItems = useDirectusItems('clients');
const clients = ref([]);
const clientsLoading = ref(false);

const isOpen = computed({
	get: () => props.modelValue,
	set: (val) => emit('update:modelValue', val),
});

const tab = ref('contact');

const form = ref({
	email: '',
	clientId: props.clientId || null,
});

const candidates = ref([]);
const candidatesLoading = ref(false);
const contactQuery = ref('');
const selectedContactId = ref(null);

const clientOptions = computed(() => clients.value);

const resolvedClientId = computed(() => props.clientId || form.value.clientId || null);

const resolvedClientName = computed(() => {
	if (props.clientId) return props.clientName || 'this client';
	if (!form.value.clientId) return '';
	return clients.value.find((c) => c.id === form.value.clientId)?.name || '';
});

const filteredCandidates = computed(() => {
	const q = contactQuery.value.trim().toLowerCase();
	const list = candidates.value;
	const filtered = q
		? list.filter((c) => {
			const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase();
			const email = (c.email ?? '').toLowerCase();
			return name.includes(q) || email.includes(q);
		})
		: list;
	// Direct-access contacts are pinned to the bottom — visible for transparency
	// but disabled. Picker leads with available + inherited so the common case
	// is one click.
	return [...filtered].sort((a, b) => {
		const rank = (c) => (c.accessStatus === 'direct' ? 2 : c.accessStatus === 'inherited' ? 1 : 0);
		return rank(a) - rank(b);
	});
});

const selectedContact = computed(() =>
	candidates.value.find((c) => c.id === selectedContactId.value) ?? null,
);

const canSubmit = computed(() => {
	if (!resolvedClientId.value) return false;
	if (sending.value) return false;
	if (tab.value === 'email') {
		return /\S+@\S+\.\S+/.test(form.value.email);
	}
	return !!selectedContact.value && !!selectedContact.value.email;
});

function contactDisplayName(c) {
	const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
	return name || c.email || 'Unnamed contact';
}

function contactInitials(c) {
	const first = (c.first_name ?? '').charAt(0);
	const last = (c.last_name ?? '').charAt(0);
	return (first + last).toUpperCase() || (c.email?.charAt(0)?.toUpperCase() ?? '?');
}

function contactPhotoUrl(c) {
	if (!c.photo) return null;
	return `${config.public.directusUrl}/assets/${c.photo}?key=avatar`;
}

function onPickContact(c) {
	if (c.accessStatus === 'direct') return;
	selectedContactId.value = c.id;
}

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

async function loadCandidates() {
	if (!resolvedClientId.value) {
		candidates.value = [];
		return;
	}
	candidatesLoading.value = true;
	try {
		candidates.value = await $fetch('/api/org/portal-invite-candidates', {
			method: 'POST',
			body: {
				organizationId: props.organizationId,
				clientId: resolvedClientId.value,
			},
		});
	} catch (e) {
		console.error('Failed to load invite candidates:', e);
		candidates.value = [];
	} finally {
		candidatesLoading.value = false;
	}
}

watch(isOpen, (val) => {
	if (val) {
		form.value.email = '';
		form.value.clientId = props.clientId || null;
		tab.value = 'contact';
		selectedContactId.value = null;
		contactQuery.value = '';
		if (!props.clientId && !clients.value.length) loadClients();
		if (resolvedClientId.value) loadCandidates();
	}
});

watch(resolvedClientId, (id) => {
	if (id && isOpen.value) loadCandidates();
});

async function sendInvitation() {
	if (!canSubmit.value) return;

	const email = tab.value === 'email' ? form.value.email : selectedContact.value?.email;
	if (!email) {
		toast.add({
			title: 'No email on file',
			description: 'This contact has no email — add one to their contact record first.',
			color: 'red',
		});
		return;
	}

	sending.value = true;
	try {
		const result = await $fetch('/api/org/invite-client', {
			method: 'POST',
			body: {
				email,
				organizationId: props.organizationId,
				clientId: resolvedClientId.value,
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
