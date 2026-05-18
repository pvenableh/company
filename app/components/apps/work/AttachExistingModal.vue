<!--
  Generic "Attach Existing X to this project" modal. Used by Tickets /
  Tasks / Invoices / Channels / Files tabs in `ProjectWorkspace`.

  Modeled on `AppsClientsAttachExistingModal`. Kept as a parallel file so
  the two surfaces (clients + projects) can evolve independently — they
  share shape but differ in language, FK targets, and the "currently on
  X" hint chip (clients show the current client; projects show the
  current project).

  Org scoping: every list call requires `selectedOrg`. The filter only
  matches rows whose `organization` (or equivalent) is the current org —
  the same scoping the underlying list pages use. Without this the modal
  would leak across orgs via the `user_created` row-perm fallback.
-->
<template>
	<UModal
		v-model="isOpen"
		:title="title"
		:description="description"
		:ui="{ content: 'max-w-lg' }"
	>
		<div class="space-y-3 mt-1">
			<div class="relative">
				<Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<input
					v-model="search"
					type="text"
					:placeholder="searchPlaceholder"
					class="w-full h-9 pl-9 pr-3 rounded-full border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
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
							v-if="getCurrentProjectName(row)"
							class="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-warning/15 text-warning shrink-0"
							:title="`Currently on ${getCurrentProjectName(row)} — attaching will move it here.`"
						>
							<Icon name="lucide:corner-up-left" class="w-2.5 h-2.5" />
							on {{ getCurrentProjectName(row) }}
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
	</UModal>
</template>

<script setup lang="ts">
interface Props {
	modelValue: boolean;
	projectId: string;
	collection: string;
	entitySingular: string;
	entityPlural: string;
	/**
	 * FK field on the row that points at a project. e.g. 'project' (most
	 * cases). Skipped when `customAttach` is set (e.g. invoices use a
	 * junction table).
	 */
	fkField?: string;
	/** Optional override for non-FK attaches (e.g. invoices.projects m2m). */
	customAttach?: (row: any) => Promise<void>;
	/** Filter clause that excludes rows already attached to this project. */
	buildExcludeAttached?: (projectId: string) => Record<string, any>;
	buildOrgFilter?: (orgId: string) => Record<string, any>;
	fields: string[];
	getLabel: (row: any) => string | null | undefined;
	getSubtitle?: (row: any) => string | null | undefined;
	getCurrentProjectName?: (row: any) => string | null | undefined;
	rowIcon: string;
	getSearchHaystack: (row: any) => string;
}

const props = withDefaults(defineProps<Props>(), {
	fkField: undefined,
	customAttach: undefined,
	buildExcludeAttached: undefined,
	buildOrgFilter: (orgId: string) => ({ organization: { _eq: orgId } }),
	getSubtitle: () => null,
	getCurrentProjectName: () => null,
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
const description = computed(() => `Search your ${props.entityPlural} and link one to this project. Items already on another project move here when picked.`);
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
		const excludeAttached = props.buildExcludeAttached
			? props.buildExcludeAttached(props.projectId)
			: props.fkField
				? { _or: [
					{ [props.fkField]: { _null: true } },
					{ [props.fkField]: { _neq: props.projectId } },
				] }
				: {};
		rows.value = await items.list({
			fields: props.fields,
			filter: {
				_and: [
					excludeAttached,
					props.buildOrgFilter(selectedOrg.value),
				],
			},
			sort: ['-date_created'],
			limit: 500,
		});
	} catch (err: any) {
		console.error(`[AttachExistingModal/work] fetch ${props.collection} failed:`, err);
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
		if (props.customAttach) {
			await props.customAttach(row);
		} else if (props.fkField) {
			await items.update(row.id, { [props.fkField]: props.projectId });
		}
		toast.add({ title: `${props.entitySingular} attached`, color: 'green' });
		emit('attached', row.id);
		rows.value = rows.value.filter((r) => r.id !== row.id);
	} catch (err: any) {
		console.error(`[AttachExistingModal/work] attach ${props.collection} failed:`, err);
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
