// composables/useDirectusPermissions.ts
/**
 * useDirectusPermissions - Query Directus permissions for conditional UI rendering
 *
 * Fetches the current user's role-based permissions and provides helper methods
 * to check access at the collection and field level.
 *
 * Usage:
 * const { can, canAccessField, isAdmin, refresh } = useDirectusPermissions()
 * if (can('update', 'tickets')) { ... }
 * if (canAccessField('update', 'tickets', 'status')) { ... }
 */

interface Permission {
	id: number
	collection: string
	action: string
	fields: string[] | null
	permissions: Record<string, any> | null
	validation: Record<string, any> | null
}

interface PermissionsState {
	admin: boolean
	permissions: Permission[]
}

// Module-level cache so permissions are fetched once per session
let _permissionsPromise: Promise<PermissionsState> | null = null
let _permissionsData: PermissionsState | null = null

export function useDirectusPermissions() {
	const { loggedIn } = useUserSession()

	/**
	 * Fetch permissions from server (cached per session)
	 */
	const fetchPermissions = async (): Promise<PermissionsState> => {
		if (_permissionsData) return _permissionsData

		if (_permissionsPromise) return _permissionsPromise

		_permissionsPromise = $fetch<PermissionsState>('/api/directus/permissions')
			.then((data) => {
				_permissionsData = data
				return data
			})
			.catch((error) => {
				console.error('[Permissions] Failed to fetch:', error)
				_permissionsPromise = null
				return { admin: false, permissions: [] }
			})

		return _permissionsPromise
	}

	/**
	 * Whether the current user has admin access (bypasses all permissions)
	 */
	const isAdmin = async (): Promise<boolean> => {
		if (!loggedIn.value) return false
		const data = await fetchPermissions()
		return data.admin
	}

	/**
	 * Check if the user can perform an action on a collection
	 * Actions: 'create', 'read', 'update', 'delete'
	 */
	const can = async (action: string, collection: string): Promise<boolean> => {
		if (!loggedIn.value) return false

		const data = await fetchPermissions()
		if (data.admin) return true

		return data.permissions.some(
			(p) => p.collection === collection && p.action === action
		)
	}

	/**
	 * Check if the user can access a specific field for an action
	 * Returns true if the field is in the allowed fields list (or if all fields are allowed)
	 */
	const canAccessField = async (
		action: string,
		collection: string,
		field: string
	): Promise<boolean> => {
		if (!loggedIn.value) return false

		const data = await fetchPermissions()
		if (data.admin) return true

		const permission = data.permissions.find(
			(p) => p.collection === collection && p.action === action
		)

		if (!permission) return false

		// null fields = all fields allowed
		if (permission.fields === null) return true

		return permission.fields.includes(field) || permission.fields.includes('*')
	}

	/**
	 * Get the raw permissions for a specific collection
	 */
	const getCollectionPermissions = async (collection: string): Promise<Permission[]> => {
		if (!loggedIn.value) return []

		const data = await fetchPermissions()
		if (data.admin) return []

		return data.permissions.filter((p) => p.collection === collection)
	}

	/**
	 * Clear cached permissions and refetch
	 */
	const refresh = async (): Promise<PermissionsState> => {
		_permissionsData = null
		_permissionsPromise = null
		return fetchPermissions()
	}

	// Auto-clear cache on logout
	if (import.meta.client) {
		watch(
			() => loggedIn.value,
			(isLoggedIn) => {
				if (!isLoggedIn) {
					_permissionsData = null
					_permissionsPromise = null
				}
			}
		)
	}

	return {
		can,
		canAccessField,
		isAdmin,
		getCollectionPermissions,
		refresh,
	}
}
