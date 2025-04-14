// composables/useDirectusUsers.ts
import { useDirectusClient } from './useDirectusClient';
import {
	createUser,
	createUsers,
	deleteUser,
	deleteUsers,
	readMe,
	readUser,
	readUsers,
	updateMe,
	updateUser,
	updateUsers,
} from '@directus/sdk';

export function useDirectusUsers() {
	const { client } = useDirectusClient();
	const user = ref<Record<string, any> | null>(null);
	const tokens = ref<{
		access_token: string | null;
		refresh_token: string | null;
	}>({
		access_token: null,
		refresh_token: null,
	});

	// Create a single user
	const createUserFn = async (userInfo: Record<string, any>) => {
		try {
			return await client.value.request(createUser(userInfo));
		} catch (error) {
			console.error('Error creating user:', error);
			throw error;
		}
	};

	// Create multiple users
	const createUsersFn = async (usersInfo: Record<string, any>[]) => {
		try {
			return await client.value.request(createUsers(usersInfo));
		} catch (error) {
			console.error('Error creating users:', error);
			throw error;
		}
	};

	// Read current user (me)
	const readMeFn = async (query?: Record<string, any>) => {
		try {
			const userData = await client.value.request(readMe(query));
			user.value = userData;
			return userData;
		} catch (error) {
			console.error('Error reading current user:', error);
			throw error;
		}
	};

	// Read a single user
	const readUserFn = async (id: string, query?: Record<string, any>) => {
		try {
			return await client.value.request(readUser(id, query));
		} catch (error) {
			console.error(`Error reading user ${id}:`, error);
			throw error;
		}
	};

	// Read a single user asynchronously
	const readAsyncUserFn = async (id: string, query?: Record<string, any>) => {
		try {
			return await client.value.request(readUser(id, query));
		} catch (error) {
			console.error(`Error reading user ${id} asynchronously:`, error);
			throw error;
		}
	};

	// Read multiple users
	const readUsersFn = async (query?: Record<string, any>) => {
		try {
			return await client.value.request(readUsers(query));
		} catch (error) {
			console.error('Error reading users:', error);
			throw error;
		}
	};

	// Read multiple users asynchronously
	const readAsyncUsersFn = async (query?: Record<string, any>) => {
		try {
			return await client.value.request(readUsers(query));
		} catch (error) {
			console.error('Error reading users asynchronously:', error);
			throw error;
		}
	};

	// Update current user (me)
	const updateMeFn = async (userInfo: Record<string, any>) => {
		try {
			const updatedUser = await client.value.request(updateMe(userInfo));
			user.value = updatedUser;
			return updatedUser;
		} catch (error) {
			console.error('Error updating current user:', error);
			throw error;
		}
	};

	// Update a specific user
	const updateUserFn = async (id: string, userInfo: Record<string, any>) => {
		try {
			return await client.value.request(updateUser(id, userInfo));
		} catch (error) {
			console.error(`Error updating user ${id}:`, error);
			throw error;
		}
	};

	// Update multiple users
	const updateUsersFn = async (ids: string[], data: Record<string, any>) => {
		try {
			return await client.value.request(updateUsers(ids, data));
		} catch (error) {
			console.error('Error updating users:', error);
			throw error;
		}
	};

	// Delete a user
	const deleteUserFn = async (id: string) => {
		try {
			return await client.value.request(deleteUser(id));
		} catch (error) {
			console.error(`Error deleting user ${id}:`, error);
			throw error;
		}
	};

	// Delete multiple users
	const deleteUsersFn = async (ids: string[]) => {
		try {
			return await client.value.request(deleteUsers(ids));
		} catch (error) {
			console.error('Error deleting users:', error);
			throw error;
		}
	};

	// Set the current user (typically used after login or during app initialization)
	const setUserFn = (userData: Record<string, any>) => {
		user.value = userData;
	};

	// Initialize tokens from a provided auth response or object
	const setTokensFn = (tokenData: { access_token: string; refresh_token?: string }) => {
		tokens.value = {
			access_token: tokenData.access_token,
			refresh_token: tokenData.refresh_token || null,
		};

		// Set token in client
		if (tokenData.access_token) {
			client.value.setToken(tokenData.access_token);
		}
	};

	return {
		// State
		user: readonly(user),
		tokens: readonly(tokens),

		// Functions
		createUser: createUserFn,
		createUsers: createUsersFn,
		deleteUser: deleteUserFn,
		deleteUsers: deleteUsersFn,
		readMe: readMeFn,
		readUser: readUserFn,
		readAsyncUser: readAsyncUserFn,
		readUsers: readUsersFn,
		readAsyncUsers: readAsyncUsersFn,
		setUser: setUserFn,
		setTokens: setTokensFn,
		updateMe: updateMeFn,
		updateUser: updateUserFn,
		updateUsers: updateUsersFn,
	};
}
