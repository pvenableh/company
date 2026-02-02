// composables/useDirectusNotifications.ts
// All operations go through server API routes - no client-side tokens

// Custom interface for your notification structure
export interface AppNotification {
	id?: string;
	timestamp?: string;
	status?: string;
	recipient?: string;
	sender?: string;
	subject?: string;
	message?: string;
	collection?: string;
	item?: string;
	read?: boolean;
	read_at?: string | null;
	organization?: string | null;
	metadata?: Record<string, any> | null;
}

export function useDirectusNotifications() {
	/**
	 * Create a single notification
	 */
	const createNotification = async (notification: Partial<AppNotification>) => {
		return await $fetch('/api/directus/notifications', {
			method: 'POST',
			body: { operation: 'create', data: notification },
		});
	};

	/**
	 * Create multiple notifications
	 */
	const createNotifications = async (notifications: Partial<AppNotification>[]) => {
		return await $fetch('/api/directus/notifications', {
			method: 'POST',
			body: { operation: 'createMany', data: notifications },
		});
	};

	/**
	 * Read a single notification
	 */
	const readNotification = async (id: string, query?: Record<string, any>) => {
		return await $fetch('/api/directus/notifications', {
			method: 'POST',
			body: { operation: 'get', id, query },
		});
	};

	/**
	 * Read a single notification asynchronously
	 */
	const readAsyncNotification = async (id: string, query?: Record<string, any>) => {
		return await readNotification(id, query);
	};

	/**
	 * Read multiple notifications
	 */
	const readNotifications = async (query?: Record<string, any>) => {
		return await $fetch('/api/directus/notifications', {
			method: 'POST',
			body: { operation: 'list', query },
		});
	};

	/**
	 * Read multiple notifications asynchronously
	 */
	const readAsyncNotifications = async (query?: Record<string, any>) => {
		return await readNotifications(query);
	};

	/**
	 * Update a single notification
	 */
	const updateNotification = async (id: string, notification: Partial<AppNotification>) => {
		return await $fetch('/api/directus/notifications', {
			method: 'POST',
			body: { operation: 'update', id, data: notification },
		});
	};

	/**
	 * Update multiple notifications
	 */
	const updateNotifications = async (ids: string[], notifications: Record<string, Partial<AppNotification>>) => {
		return await $fetch('/api/directus/notifications', {
			method: 'POST',
			body: { operation: 'updateMany', ids, data: notifications },
		});
	};

	/**
	 * Delete a single notification
	 */
	const deleteNotification = async (id: string) => {
		return await $fetch('/api/directus/notifications', {
			method: 'POST',
			body: { operation: 'delete', id },
		});
	};

	/**
	 * Delete multiple notifications
	 */
	const deleteNotifications = async (ids: string[]) => {
		return await $fetch('/api/directus/notifications', {
			method: 'POST',
			body: { operation: 'deleteMany', ids },
		});
	};

	/**
	 * Mark a notification as read
	 */
	const markAsRead = async (id: string) => {
		return await $fetch('/api/directus/notifications', {
			method: 'POST',
			body: {
				operation: 'update',
				id,
				data: { read: true, read_at: new Date().toISOString() },
			},
		});
	};

	/**
	 * Mark multiple notifications as read
	 */
	const markMultipleAsRead = async (ids: string[]) => {
		const now = new Date().toISOString();
		return await $fetch('/api/directus/notifications', {
			method: 'POST',
			body: {
				operation: 'updateMany',
				ids,
				data: { read: true, read_at: now },
			},
		});
	};

	/**
	 * Get unread notifications count
	 */
	const getUnreadCount = async (userId?: string, organizationId?: string | null) => {
		try {
			const filter: Record<string, any> = {
				read: { _eq: false },
			};

			if (userId) {
				filter.recipient = { _eq: userId };
			}

			if (organizationId) {
				filter.organization = { _eq: organizationId };
			}

			const result = await $fetch('/api/directus/notifications', {
				method: 'POST',
				body: {
					operation: 'list',
					query: {
						filter,
						aggregate: { count: 'id' },
					},
				},
			}) as any;

			// Handle different response formats
			if (result && typeof result === 'object') {
				if ('data' in result && Array.isArray(result.data)) {
					return result.data[0]?.count ?? 0;
				} else if (Array.isArray(result)) {
					return result[0]?.count ?? 0;
				}
			}
			return 0;
		} catch (error) {
			console.error('Error getting unread notification count:', error);
			return 0;
		}
	};

	return {
		createNotification,
		createNotifications,
		readNotification,
		readAsyncNotification,
		readNotifications,
		readAsyncNotifications,
		updateNotification,
		updateNotifications,
		deleteNotification,
		deleteNotifications,
		markAsRead,
		markMultipleAsRead,
		getUnreadCount,
	};
}
