// composables/useDirectusUsers.ts
// All operations go through server API routes - no client-side tokens

export function useDirectusUsers() {
	const user = ref<Record<string, any> | null>(null);

	// Create a single user
	const createUserFn = async (userInfo: Record<string, any>) => {
		return await $fetch('/api/directus/users', {
			method: 'POST',
			body: { operation: 'create', data: userInfo },
		});
	};

	// Create multiple users
	const createUsersFn = async (usersInfo: Record<string, any>[]) => {
		return await $fetch('/api/directus/users', {
			method: 'POST',
			body: { operation: 'createMany', data: usersInfo },
		});
	};

	// Read current user (me)
	const readMeFn = async (query?: Record<string, any>) => {
		const fields = query?.fields ? (Array.isArray(query.fields) ? query.fields.join(',') : query.fields) : undefined;
		const userData = await $fetch('/api/directus/users/me', {
			method: 'GET',
			params: fields ? { fields } : undefined,
		});
		user.value = userData as Record<string, any>;
		return userData;
	};

	// Read a single user
	const readUserFn = async (id: string, query?: Record<string, any>) => {
		const fields = query?.fields ? (Array.isArray(query.fields) ? query.fields.join(',') : query.fields) : undefined;
		return await $fetch(`/api/directus/users/${id}`, {
			method: 'GET',
			params: fields ? { fields } : undefined,
		});
	};

	// Read multiple users
	const readUsersFn = async (query?: Record<string, any>) => {
		return await $fetch('/api/directus/users', {
			method: 'POST',
			body: { operation: 'list', query },
		});
	};

	// Update current user (me)
	const updateMeFn = async (userInfo: Record<string, any>) => {
		const updatedUser = await $fetch('/api/directus/users/me', {
			method: 'PATCH',
			body: userInfo,
		});
		user.value = updatedUser as Record<string, any>;
		return updatedUser;
	};

	// Update a specific user
	const updateUserFn = async (id: string, userInfo: Record<string, any>) => {
		return await $fetch(`/api/directus/users/${id}`, {
			method: 'PATCH',
			body: userInfo,
		});
	};

	// Update multiple users
	const updateUsersFn = async (ids: string[], data: Record<string, any>) => {
		return await $fetch('/api/directus/users', {
			method: 'POST',
			body: { operation: 'updateMany', ids, data },
		});
	};

	// Delete a user
	const deleteUserFn = async (id: string) => {
		return await $fetch(`/api/directus/users/${id}`, {
			method: 'DELETE',
		});
	};

	// Delete multiple users
	const deleteUsersFn = async (ids: string[]) => {
		return await $fetch('/api/directus/users', {
			method: 'POST',
			body: { operation: 'deleteMany', ids },
		});
	};

	// Set the current user
	const setUserFn = (userData: Record<string, any>) => {
		user.value = userData;
	};

	return {
		// State
		user: readonly(user),

		// Functions
		createUser: createUserFn,
		createUsers: createUsersFn,
		deleteUser: deleteUserFn,
		deleteUsers: deleteUsersFn,
		readMe: readMeFn,
		readUser: readUserFn,
		readUsers: readUsersFn,
		setUser: setUserFn,
		updateMe: updateMeFn,
		updateUser: updateUserFn,
		updateUsers: updateUsersFn,
	};
}
