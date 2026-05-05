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
 */

interface ClientPortalUserRow {
	id: string;
	organization: string | { id: string };
	user: string | { id: string };
	client: string | { id: string; name?: string };
	status: 'active' | 'pending' | 'suspended';
	invited_at?: string | null;
	accepted_at?: string | null;
}

export interface ResolvedClientPortalUser {
	id: string;
	organizationId: string;
	clientId: string;
	clientName: string | null;
	status: 'active' | 'pending' | 'suspended';
}

function normalize(row: ClientPortalUserRow): ResolvedClientPortalUser | null {
	const orgId = typeof row.organization === 'object' ? row.organization?.id : row.organization;
	const clientField = row.client;
	const clientId = typeof clientField === 'object' ? clientField?.id : clientField;
	const clientName =
		typeof clientField === 'object' && clientField?.name ? clientField.name : null;
	if (!orgId || !clientId) return null;
	return {
		id: row.id,
		organizationId: orgId,
		clientId,
		clientName,
		status: row.status,
	};
}

export function useClientPortalUser() {
	const portalRows = useState<ResolvedClientPortalUser[]>('clientPortalUserRows', () => []);
	const loading = useState<boolean>('clientPortalUserLoading', () => false);
	const initialized = useState<boolean>('clientPortalUserInitialized', () => false);

	const portalItems = useDirectusItems<ClientPortalUserRow>('client_portal_users');
	const { user } = useDirectusAuth();
	const { selectedOrg } = useOrganization();

	async function fetchPortalRows(): Promise<void> {
		if (!user.value?.id) {
			portalRows.value = [];
			initialized.value = true;
			return;
		}
		loading.value = true;
		try {
			const rows = await portalItems.list({
				filter: {
					user: { _eq: user.value.id },
					status: { _eq: 'active' },
				},
				fields: ['id', 'organization', 'user', 'client.id', 'client.name', 'status'],
				limit: -1,
			});
			portalRows.value = rows
				.map(normalize)
				.filter((x): x is ResolvedClientPortalUser => !!x);
		} catch (err) {
			console.error('Failed to fetch client_portal_users:', err);
			portalRows.value = [];
		} finally {
			loading.value = false;
			initialized.value = true;
		}
	}

	/** All active portal-user rows for the current Directus user, across orgs. */
	const allPortalUsers = computed(() => portalRows.value);

	/** The portal-user row matching the currently-selected org, if any. */
	const currentPortalUser = computed<ResolvedClientPortalUser | null>(() => {
		if (!selectedOrg.value) return null;
		return portalRows.value.find((r) => r.organizationId === selectedOrg.value) ?? null;
	});

	/** First active portal-user row across any org. Used by tryRestoreSelectedOrg. */
	const firstPortalUser = computed<ResolvedClientPortalUser | null>(
		() => portalRows.value[0] ?? null,
	);

	/** True if the user is acting as a portal user in the currently-selected org. */
	const isPortalUserHere = computed(() => !!currentPortalUser.value);

	/** Root client FK for the current org's portal context (null if not a portal user here). */
	const clientScope = computed<string | null>(() => currentPortalUser.value?.clientId ?? null);

	/** Display name of the root client for the current org. */
	const clientName = computed<string | null>(() => currentPortalUser.value?.clientName ?? null);

	return {
		allPortalUsers,
		currentPortalUser,
		firstPortalUser,
		isPortalUserHere,
		clientScope,
		clientName,
		loading: readonly(loading),
		initialized: readonly(initialized),
		fetchPortalRows,
	};
}
