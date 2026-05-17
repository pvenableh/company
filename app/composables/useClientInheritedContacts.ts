/**
 * Shared ancestor walker for a client's inherited contacts + partner
 * connections. Both the full-page detail at `/apps/clients/[id]` and
 * the `ClientDetailPanel` slide-over need the same merge logic — direct
 * collection + anything inherited from ancestors up the parent chain.
 *
 * Returns reactive refs so the consumer can render rows immediately as
 * each ancestor's fetch lands.
 */
import { ref } from 'vue';

export interface InheritedContactRow {
	contact: any;
	inheritedFromId: string;
	inheritedFromName: string;
}

export interface InheritedConnectionRow {
	connection: any;
	inheritedFromId: string;
	inheritedFromName: string;
}

export function useClientInheritedContacts(maxDepth = 3) {
	const contactItemsApi = useDirectusItems('contacts');
	const { listForClient, getAncestorClientIds } = useContactConnections();
	const { selectedOrg } = useOrganization();

	const inheritedContacts = ref<InheritedContactRow[]>([]);
	const inheritedConnections = ref<InheritedConnectionRow[]>([]);
	const loading = ref(false);

	async function load(clientId: string) {
		if (!clientId) {
			inheritedContacts.value = [];
			inheritedConnections.value = [];
			return;
		}
		loading.value = true;
		const nextContacts: InheritedContactRow[] = [];
		const nextConnections: InheritedConnectionRow[] = [];
		try {
			const ancestors = await getAncestorClientIds(clientId, maxDepth);
			for (const ancestor of ancestors) {
				try {
					// Client-scope is transitive (ancestor must already be in
					// this org), but Directus's contacts row-perm has a
					// `user_created` fallback that returns rows missing the
					// current-org junction. Add the M2M filter explicitly so
					// contacts the user once created in another org don't
					// surface here.
					const orgFilterClause = selectedOrg.value
						? [{ organizations: { organizations_id: { _eq: selectedOrg.value } } }]
						: [];
					const rows = (await contactItemsApi.list({
						filter: {
							_and: [
								{ client: { _eq: ancestor.id } },
								...orgFilterClause,
							],
						},
						fields: ['id', 'first_name', 'last_name', 'email', 'phone', 'title', 'category', 'is_billing_contact'],
						limit: -1,
					})) as any[];
					for (const c of rows) {
						nextContacts.push({ contact: c, inheritedFromId: ancestor.id, inheritedFromName: ancestor.name });
					}
				} catch { /* skip */ }
				try {
					const conns = (await listForClient(ancestor.id)) as any[];
					for (const c of conns) {
						nextConnections.push({ connection: c, inheritedFromId: ancestor.id, inheritedFromName: ancestor.name });
					}
				} catch { /* skip */ }
			}
		} finally {
			inheritedContacts.value = nextContacts;
			inheritedConnections.value = nextConnections;
			loading.value = false;
		}
	}

	return { inheritedContacts, inheritedConnections, loading, load };
}
