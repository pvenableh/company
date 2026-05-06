/**
 * useClientPortalUser — External portal-user identity
 *
 * Sole source of truth for "is the current Directus user a client-portal user
 * of the selected org?" Reads from `client_portal_users`, the table that
 * replaced the `role.slug='client'` rows in `org_memberships`.
 *
 * Each row scopes one Directus user to one root client within one
 * organization. The `parent_client` walk (server-side, see
 * `server/utils/portal-auth.ts`) extends visibility to descendant clients,
 * 2 hops deep — this composable returns only the root client; the walk is
 * the server's job.
 *
 * Dual-role case (client at org A, owner at org B) is preserved by keying
 * the active row off `selectedOrg`.
 *
 * State note: portal rows are fetched and populated by
 * `useOrganization.fetchOrganizationDetails` and stored in the shared
 * `clientPortalRows` useState key. This composable is a read-only view over
 * that state — it does not fetch on its own. Calling `useClientPortalUser`
 * before `useOrganization` has initialized will return empty values; ensure
 * `initializeOrganizations()` has resolved first.
 */

export interface ResolvedClientPortalUser {
	id: string;
	organizationId: string;
	clientId: string;
	clientName: string | null;
	status?: 'active' | 'pending' | 'suspended';
}

export function useClientPortalUser() {
	// Same state key that useOrganization writes to. Do NOT introduce a parallel
	// fetch — we'd race the org-init pipeline and the two views would drift.
	const portalRows = useState<ResolvedClientPortalUser[]>('clientPortalRows', () => []);
	const { selectedOrg } = useOrganization();

	const allPortalUsers = computed(() => portalRows.value);

	const currentPortalUser = computed<ResolvedClientPortalUser | null>(() => {
		if (!selectedOrg.value) return null;
		return portalRows.value.find((r) => r.organizationId === selectedOrg.value) ?? null;
	});

	const firstPortalUser = computed<ResolvedClientPortalUser | null>(
		() => portalRows.value[0] ?? null,
	);

	const isPortalUserHere = computed(() => !!currentPortalUser.value);

	const clientScope = computed<string | null>(() => currentPortalUser.value?.clientId ?? null);

	const clientName = computed<string | null>(() => currentPortalUser.value?.clientName ?? null);

	return {
		allPortalUsers,
		currentPortalUser,
		firstPortalUser,
		isPortalUserHere,
		clientScope,
		clientName,
	};
}
