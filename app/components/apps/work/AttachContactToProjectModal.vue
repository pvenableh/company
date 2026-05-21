<!--
  Attach an existing contact to a project via the `projects_contacts`
  junction. Unlike `clients/AttachExistingModal` (which updates a single
  FK on the row), this modal CREATES a new junction row each time —
  contacts are m2m with projects, so the same contact can be pinned to
  many projects.

  Org scoping: contacts have an `organizations` m2m (no direct org FK),
  so the filter walks `organizations.organizations_id._eq <currentOrg>`.
  Falls back to the client roster when a `clientId` is supplied — those
  contacts are highest-relevance for the project's parent client.

  Already-attached IDs are filtered client-side: the caller passes
  `alreadyAttachedIds` so re-opening the modal doesn't show contacts
  the user just attached.
-->
<template>
	<AppsAppBottomSheet v-model="isOpen" :title="title" :subtitle="description">
		<div class="space-y-3">
			<div class="relative">
				<Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<input
					v-model="search"
					type="text"
					placeholder="Search contacts…"
					class="w-full h-9 pl-9 pr-3 rounded-full border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
				/>
			</div>

			<div class="border border-border rounded-xl overflow-hidden">
				<div v-if="loading" class="px-3 py-6 text-center text-xs text-muted-foreground">
					<Icon name="lucide:loader-2" class="w-4 h-4 animate-spin inline-block" />
				</div>
				<div v-else-if="!filteredRows.length" class="px-3 py-6 text-center text-xs text-muted-foreground">
					{{ search ? 'No matching contacts.' : 'No attachable contacts in this organization.' }}
				</div>
				<div v-else class="max-h-[360px] overflow-y-auto">
					<button
						v-for="row in filteredRows"
						:key="row.id"
						class="flex items-center gap-3 w-full min-h-12 py-2 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors text-left disabled:opacity-50"
						:disabled="attaching === row.id"
						@click="attach(row)"
					>
						<Icon name="lucide:user-circle" class="w-4 h-4 text-muted-foreground shrink-0" />
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium truncate">
								{{ row.first_name }} {{ row.last_name }}
							</p>
							<p v-if="row.email || row.title" class="text-[11px] text-muted-foreground truncate">
								<span v-if="row.title">{{ row.title }}</span>
								<span v-if="row.title && row.email" class="mx-1">·</span>
								<span v-if="row.email" class="font-mono">{{ row.email }}</span>
							</p>
						</div>
						<span
							v-if="isOnClientRoster(row)"
							class="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-info/15 text-info shrink-0"
							title="Already on this project's client roster"
						>
							<Icon name="lucide:link-2" class="w-2.5 h-2.5" />
							Client roster
						</span>
						<Icon
							v-if="attaching === row.id"
							name="lucide:loader-2"
							class="w-4 h-4 animate-spin text-muted-foreground shrink-0"
						/>
						<Icon
							v-else
							name="lucide:link"
							class="w-3.5 h-3.5 text-muted-foreground/40 shrink-0"
						/>
					</button>
				</div>
			</div>
		</div>
	</AppsAppBottomSheet>
</template>

<script setup lang="ts">
import { notifyEntityChange } from '~/composables/useEntityStore';

interface Props {
	modelValue: boolean;
	projectId: string;
	/** Owning org for the project — used to scope contact search. */
	organizationId?: string;
	/**
	 * Optional client for the project. When set, contacts already on this
	 * client's roster get a chip so the user can confirm intent.
	 */
	clientId?: string;
	/**
	 * Contact IDs already attached to this project, so we can filter them
	 * out of the search results (the caller knows the current set).
	 */
	alreadyAttachedIds?: string[];
}

const props = withDefaults(defineProps<Props>(), {
	organizationId: undefined,
	clientId: undefined,
	alreadyAttachedIds: () => [],
});

const emit = defineEmits<{
	(e: 'update:modelValue', value: boolean): void;
	(e: 'attached', contactId: string): void;
}>();

const isOpen = computed({
	get: () => props.modelValue,
	set: (v) => emit('update:modelValue', v),
});

const title = 'Attach Existing Contact';
const description = 'Pin an existing contact to this project. The contact can be on multiple projects at once.';

const search = ref('');
const rows = ref<any[]>([]);
const clientContactIds = ref<Set<string>>(new Set());
const loading = ref(false);
const attaching = ref<string | null>(null);

const { selectedOrg } = useOrganization();
const contactItems = useDirectusItems('contacts');
const clientContactsItems = useDirectusItems('clients_contacts');
const projectsContactsItems = useDirectusItems('projects_contacts');
const toast = useToast();

async function fetchClientContactIds() {
	if (!props.clientId) {
		clientContactIds.value = new Set();
		return;
	}
	try {
		const r = await clientContactsItems.list({
			fields: ['contacts_id'],
			filter: { clients_id: { _eq: props.clientId } },
			limit: -1,
		});
		clientContactIds.value = new Set(
			(r || [])
				.map((row: any) => (typeof row.contacts_id === 'object' ? row.contacts_id?.id : row.contacts_id))
				.filter(Boolean),
		);
	} catch {
		clientContactIds.value = new Set();
	}
}

async function fetchAttachable() {
	loading.value = true;
	try {
		const orgId = props.organizationId || selectedOrg.value;
		if (!orgId) {
			rows.value = [];
			return;
		}
		// Contacts are m2m with organizations — scope to the project's owning
		// org (or the user's selectedOrg as a fallback).
		const filter: Record<string, any> = {
			organizations: { organizations_id: { _eq: orgId } },
		};
		// Drop contacts already attached to this project so the list reflects
		// what can actually be added.
		if (props.alreadyAttachedIds.length) {
			filter.id = { _nin: props.alreadyAttachedIds };
		}
		rows.value = await contactItems.list({
			fields: ['id', 'first_name', 'last_name', 'email', 'title'],
			filter,
			sort: ['first_name', 'last_name'],
			limit: 500,
		});
	} catch (err: any) {
		console.error('[AttachContactToProjectModal] fetch contacts failed:', err);
		toast.add({ title: 'Failed to load contacts', description: err?.message, color: 'red' });
		rows.value = [];
	} finally {
		loading.value = false;
	}
}

function isOnClientRoster(row: any): boolean {
	return clientContactIds.value.has(row.id);
}

const filteredRows = computed(() => {
	const q = search.value.trim().toLowerCase();
	if (!q) return rows.value;
	return rows.value.filter((r) => {
		const hay = `${r.first_name || ''} ${r.last_name || ''} ${r.email || ''} ${r.title || ''}`.toLowerCase();
		return hay.includes(q);
	});
});

async function attach(row: any) {
	attaching.value = row.id;
	try {
		await projectsContactsItems.create({
			project: props.projectId,
			contact: row.id,
			sort: (props.alreadyAttachedIds.length + 1) * 10,
		});
		toast.add({ title: 'Contact attached', color: 'green' });
		notifyEntityChange('projects_contacts', { id: row.id, op: 'create' });
		emit('attached', row.id);
		rows.value = rows.value.filter((r) => r.id !== row.id);
	} catch (err: any) {
		console.error('[AttachContactToProjectModal] attach failed:', err);
		toast.add({ title: 'Failed to attach contact', description: err?.message, color: 'red' });
	} finally {
		attaching.value = null;
	}
}

watch(isOpen, (open) => {
	if (open) {
		search.value = '';
		fetchClientContactIds();
		fetchAttachable();
	}
});
</script>
