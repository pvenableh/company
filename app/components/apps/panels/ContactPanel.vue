<!--
  ContactPanel — slide-over body for a single contact.

  Mounted by `<AppSlideOverStack>` when the global stack contains a
  `contact:<id>` entry. Fetches its own data so it survives both the
  page that triggered it being unmounted and reloads on a deep-linked
  `?slide=contact:<id>` URL.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();

const emit = defineEmits<{ (e: 'close'): void }>();

const contactItemsApi = useDirectusItems('contacts');
const { selectedOrg } = useOrganization();
// Register this contact as the AI panel's current entity so Earnest is aware of
// who you're viewing. The server has a `contact` context builder; we just have
// to tell the panel which contact is open (and drop it when the slide-over closes).
const { setEntity, entityId, resetEntityContext } = useEntityPageContext();

const contact = ref<any | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const showEditModal = ref(false);

// Prefer the linked client's name over the manually-typed `company` field —
// once a contact is wired to a client, that client name is the authoritative
// label. Falls back to `company` for unlinked contacts (CardDesk imports,
// partners, vendors, leads without a client yet).
const companyLabel = computed(() => {
	const c = contact.value;
	if (!c) return null;
	return c.client?.name || c.company || null;
});

// The connected client's id (when this contact is wired to a client) so we can
// reference that account's Earnest rating right on the person.
const linkedClientId = computed(() => {
	const c = contact.value?.client as any;
	if (!c) return null;
	return typeof c === 'object' ? (c.id != null ? String(c.id) : null) : String(c);
});

const title = computed(() => {
	const c = contact.value;
	if (!c) return 'Contact';
	const name = `${c.first_name || ''} ${c.last_name || ''}`.trim();
	return name || 'Contact';
});

async function reloadContact() {
	const id = props.id;
	if (!id) return;
	try {
		const fetched = await contactItemsApi.get(id, {
			fields: ['*', 'client.id', 'client.name', 'organizations.organizations_id'],
		});
		contact.value = fetched;
	} catch (err: any) {
		error.value = err?.message || 'Failed to reload contact';
	}
}

function onContactUpdated() {
	showEditModal.value = false;
	reloadContact();
}

function onContactDeleted() {
	showEditModal.value = false;
	emit('close');
}

watch(
	() => props.id,
	async (id) => {
		if (!id) return;
		loading.value = true;
		error.value = null;
		contact.value = null;
		try {
			const fetched = await contactItemsApi.get(id, {
				fields: ['*', 'client.id', 'client.name', 'organizations.organizations_id'],
			});
			// Verify the contact belongs to the currently-selected org before
			// rendering. Directus's row-perm fallback on `user_created` lets a
			// user re-read contacts they originally created in a previous org;
			// the M2M junction is the authoritative tenant filter.
			const orgIds: string[] = Array.isArray(fetched?.organizations)
				? fetched.organizations
					.map((j: any) => (typeof j === 'object' ? j?.organizations_id : null))
					.filter(Boolean)
				: [];
			if (!selectedOrg.value || !orgIds.includes(selectedOrg.value)) {
				error.value = 'Contact not found in this organization';
				contact.value = null;
			} else {
				contact.value = fetched;
				setEntity('contact', String(id), title.value);
			}
		} catch (err: any) {
			error.value = err?.message || 'Failed to load contact';
		} finally {
			loading.value = false;
		}
	},
	{ immediate: true },
);

// Drop the entity context when this slide-over closes — but only if it's still
// pointing at us (a panel pushed on top may have taken over the context).
onBeforeUnmount(() => {
	if (entityId.value === String(props.id)) resetEntityContext();
});
</script>

<template>
	<AppSlideOverShell :title="title" @close="$emit('close')">
		<template v-if="contact" #actions>
			<button
				type="button"
				class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
				@click="showEditModal = true"
			>
				<Icon name="lucide:pencil" class="w-3.5 h-3.5" />
				Edit
			</button>
		</template>

		<div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3">
			<span class="spinner-ios spinner-ios--lg" role="status" aria-label="Loading" />
			<p class="text-xs text-muted-foreground">Loading contact…</p>
		</div>

		<div v-else-if="contact" class="space-y-5">
			<div class="flex items-center gap-3">
				<div
					class="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0"
				>
					{{ (contact.first_name || '?').charAt(0) }}{{ (contact.last_name || '').charAt(0) }}
				</div>
				<div class="min-w-0">
					<p class="text-base font-semibold truncate">
						{{ contact.first_name }} {{ contact.last_name }}
					</p>
					<p
						v-if="contact.title || companyLabel"
						class="text-xs text-muted-foreground truncate"
					>
						{{ [contact.title, companyLabel].filter(Boolean).join(' · ') }}
					</p>
				</div>
			</div>

			<div class="space-y-2.5 text-sm">
				<div v-if="contact.email" class="flex items-center gap-2">
					<Icon name="lucide:mail" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
					<a
						:href="`mailto:${contact.email}`"
						class="font-mono text-xs hover:text-primary truncate"
					>
						{{ contact.email }}
					</a>
				</div>
				<div v-if="contact.phone" class="flex items-center gap-2">
					<Icon name="lucide:phone" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
					<a :href="`tel:${contact.phone}`" class="text-xs hover:text-primary">
						{{ contact.phone }}
					</a>
				</div>
				<div v-if="companyLabel" class="flex items-center gap-2">
					<Icon name="lucide:building-2" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
					<span class="text-xs">{{ companyLabel }}</span>
					<ClientsClientRatingBadge v-if="linkedClientId" :client-id="linkedClientId" size="xs" />
				</div>
				<div v-if="contact.category" class="flex items-center gap-2">
					<Icon name="lucide:tag" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
					<span class="text-xs capitalize">{{ contact.category }}</span>
				</div>
			</div>

			<div v-if="contact.notes" class="space-y-1 pt-3 border-t border-border/30">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</p>
				<p class="text-sm whitespace-pre-wrap">{{ contact.notes }}</p>
			</div>

			<!-- Touchpoints — this person's communication log (scoped to the
			     contact via the m2m; new touches tag them + their client). -->
			<div class="space-y-2 pt-3 border-t border-border/30">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Touchpoints</p>
				<AppsTouchpoints
					:contact-id="String(props.id)"
					:client-id="linkedClientId"
					:organization-id="selectedOrg"
				/>
			</div>
		</div>

		<div v-else-if="error" class="text-sm text-destructive py-10 text-center">
			{{ error }}
		</div>

		<div v-else class="text-sm text-muted-foreground py-10 text-center">
			Could not load contact.
		</div>

		<ContactsFormModal
			v-if="contact"
			v-model="showEditModal"
			:contact="contact"
			@updated="onContactUpdated"
			@deleted="onContactDeleted"
		/>
	</AppSlideOverShell>
</template>
