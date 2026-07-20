<!--
  Generic "Attach Existing X to this client" modal. Used by Projects /
  Tickets / Tasks / Invoices / Channels tabs in `ClientWorkspace`.

  Mirrors the shape of `Clients/AddExistingContactModal` but parameterised
  over collection name, FK field, label/subtitle fields, and search
  predicate. Rows already attached to ANOTHER client (or no client) show
  with a hint chip so re-homing them is intentional, not silent.

  Org scoping: every list call requires `selectedOrg`. The filter only
  matches rows whose `organization` (or equivalent) is the current org —
  the same scoping the underlying list pages use. Without this the modal
  would leak across orgs via the `user_created` row-perm fallback.
-->
<template>
	<AppsAppBottomSheet
		v-model="isOpen"
		:title="title"
		:subtitle="description"
	>
		<div class="space-y-3">
			<div class="relative">
				<Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<input
					v-model="search"
					type="text"
					:placeholder="searchPlaceholder"
					class="w-full h-9 pl-9 pr-3 rounded-full glass-field text-sm focus:outline-none"
				/>
			</div>

			<div class="border border-border rounded-xl overflow-hidden">
				<div v-if="loading" class="px-3 py-6 text-center text-xs text-muted-foreground">
					<Icon name="lucide:loader-2" class="w-4 h-4 animate-spin inline-block" />
				</div>
				<div v-else-if="!filteredRows.length" class="px-3 py-6 text-center text-xs text-muted-foreground">
					{{ search ? `No matching ${entityPlural}.` : `No attachable ${entityPlural} in this organization.` }}
				</div>
				<div v-else class="max-h-[360px] overflow-y-auto">
					<button
						v-for="row in filteredRows"
						:key="row.id"
						class="flex items-center gap-3 w-full min-h-12 py-2 px-3 hover:bg-muted/40 border-b border-border/30 last:border-b-0 transition-colors text-left disabled:opacity-50"
						:disabled="attaching === row.id"
						@click="attach(row)"
					>
						<Icon :name="rowIcon" class="w-4 h-4 text-muted-foreground shrink-0" />
						<div class="flex-1 min-w-0">
							<p class="text-sm font-medium truncate">{{ getLabel(row) || `${entitySingular} ${String(row.id).slice(0, 8)}` }}</p>
							<p v-if="getSubtitle(row)" class="text-[11px] text-muted-foreground truncate">
								{{ getSubtitle(row) }}
							</p>
						</div>
						<span
							v-if="getCurrentClientName(row)"
							class="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-warning/15 text-warning shrink-0"
							:title="`Currently on ${getCurrentClientName(row)} — attaching will move it here.`"
						>
							<Icon name="lucide:corner-up-left" class="w-2.5 h-2.5" />
							on {{ getCurrentClientName(row) }}
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
	clientId: string;
	/** Entity collection name, e.g. 'projects', 'tickets', 'tasks', 'invoices', 'channels'. */
	collection: string;
	/** Singular noun for empty/title copy, e.g. 'Project'. */
	entitySingular: string;
	/** Plural lowercase noun, e.g. 'projects'. */
	entityPlural: string;
	/** FK field on the row that points at a client. e.g. 'client' or 'client_id'. */
	fkField: string;
	/**
	 * Builder for the org-scoping filter. Receives the current org id and
	 * returns a Directus filter clause. Default scopes by `organization`
	 * directly; pass a custom builder for deep paths like
	 * `client.organization` (invoices have no direct org column) or
	 * `organization_id` (tasks collection).
	 */
	buildOrgFilter?: (orgId: string) => Record<string, any>;
	/** Fields to fetch (must include id + fkField + display). */
	fields: string[];
	/** Function turning a row into its primary label. */
	getLabel: (row: any) => string | null | undefined;
	/** Function turning a row into a secondary line (status, dates, etc.). */
	getSubtitle?: (row: any) => string | null | undefined;
	/** Function returning the name of the row's current client (if any). */
	getCurrentClientName?: (row: any) => string | null | undefined;
	/** Lucide icon name for the row + dialog title. */
	rowIcon: string;
	/** Function returning haystack string for search filter. */
	getSearchHaystack: (row: any) => string;
}

const props = withDefaults(defineProps<Props>(), {
	buildOrgFilter: (orgId: string) => ({ organization: { _eq: orgId } }),
	getSubtitle: () => null,
	getCurrentClientName: () => null,
});

const emit = defineEmits<{
	(e: 'update:modelValue', value: boolean): void;
	(e: 'attached', id: string): void;
}>();

const isOpen = computed({
	get: () => props.modelValue,
	set: (v) => emit('update:modelValue', v),
});

const title = computed(() => `Attach Existing ${props.entitySingular}`);
const description = computed(() => `Search your ${props.entityPlural} and link one to this client. Items already on another client move here when picked.`);
const searchPlaceholder = computed(() => `Search ${props.entityPlural}…`);

const search = ref('');
const rows = ref<any[]>([]);
const loading = ref(false);
const attaching = ref<string | null>(null);

const { selectedOrg } = useOrganization();
const items = useDirectusItems(props.collection);
const toast = useToast();

async function fetchAttachable() {
	loading.value = true;
	try {
		if (!selectedOrg.value) {
			rows.value = [];
			return;
		}
		// "Not already on THIS client" — covers both unattached rows and rows
		// currently on another client. App-level org scoping via the supplied
		// `buildOrgFilter` matches what the entity list pages use.
		const orFilter: any[] = [
			{ [props.fkField]: { _null: true } },
			{ [props.fkField]: { _neq: props.clientId } },
		];
		rows.value = await items.list({
			fields: props.fields,
			filter: {
				_and: [
					{ _or: orFilter },
					props.buildOrgFilter(selectedOrg.value),
				],
			},
			sort: ['-date_created'],
			limit: 500,
		});
	} catch (err: any) {
		console.error(`[AttachExistingModal] fetch ${props.collection} failed:`, err);
		toast.add({ title: `Failed to load ${props.entityPlural}`, description: err?.message, color: 'red' });
		rows.value = [];
	} finally {
		loading.value = false;
	}
}

const filteredRows = computed(() => {
	const q = search.value.trim().toLowerCase();
	if (!q) return rows.value;
	return rows.value.filter((r) => props.getSearchHaystack(r).toLowerCase().includes(q));
});

async function attach(row: any) {
	attaching.value = row.id;
	try {
		await items.update(row.id, { [props.fkField]: props.clientId });
		// Notify every entity-store on this collection so the parent workspace's
		// list view repaints without the caller needing to refetch. P1.75 hook.
		notifyEntityChange(props.collection, { id: row.id, op: 'update' });
		toast.add({ title: `${props.entitySingular} attached`, color: 'green' });
		emit('attached', row.id);
		rows.value = rows.value.filter((r) => r.id !== row.id);
	} catch (err: any) {
		console.error(`[AttachExistingModal] attach ${props.collection} failed:`, err);
		toast.add({ title: `Failed to attach ${props.entitySingular.toLowerCase()}`, description: err?.message, color: 'red' });
	} finally {
		attaching.value = null;
	}
}

watch(isOpen, (open) => {
	if (open) {
		search.value = '';
		fetchAttachable();
	}
});
</script>
