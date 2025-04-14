// composables/useDirectusNotifications.ts
import { useDirectusClient } from './useDirectusClient';
import {
	createNotification as createNotificationSdk,
	createNotifications as createNotificationsSdk,
	readNotification as readNotificationSdk,
	readNotifications as readNotificationsSdk,
	updateNotification as updateNotificationSdk,
	updateNotifications as updateNotificationsSdk,
	deleteNotification as deleteNotificationSdk,
	deleteNotifications as deleteNotificationsSdk,
} from '@directus/sdk';

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
	const { client } = useDirectusClient();

	/**
	 * Create a single notification
	 */
	const createNotification = async (notification: Partial<AppNotification>) => {
		try {
			// Type cast to work with SDK function
			return await client.value.request(createNotificationSdk(notification as any));
		} catch (error) {
			console.error('Error creating notification:', error);
			throw error;
		}
	};

	/**
	 * Create multiple notifications
	 */
	const createNotifications = async (notifications: Partial<AppNotification>[]) => {
		try {
			// Type cast to work with SDK function
			return await client.value.request(createNotificationsSdk(notifications as any));
		} catch (error) {
			console.error('Error creating multiple notifications:', error);
			throw error;
		}
	};

	/**
	 * Read a single notification
	 */
	const readNotification = async (id: string, query?: Record<string, any>) => {
		try {
			return await client.value.request(readNotificationSdk(id, query));
		} catch (error) {
			console.error(`Error reading notification with ID ${id}:`, error);
			throw error;
		}
	};

	/**
	 * Read a single notification asynchronously
	 */
	const readAsyncNotification = async (id: string, query?: Record<string, any>) => {
		try {
			return await client.value.request(readNotificationSdk(id, query));
		} catch (error) {
			console.error(`Error reading async notification with ID ${id}:`, error);
			throw error;
		}
	};

	/**
	 * Read multiple notifications
	 */
	const readNotifications = async (query?: Record<string, any>) => {
		try {
			return await client.value.request(readNotificationsSdk(query));
		} catch (error) {
			console.error('Error reading notifications:', error);
			throw error;
		}
	};

	/**
	 * Read multiple notifications asynchronously
	 */
	const readAsyncNotifications = async (query?: Record<string, any>) => {
		try {
			return await client.value.request(readNotificationsSdk(query));
		} catch (error) {
			console.error('Error reading async notifications:', error);
			throw error;
		}
	};

	/**
	 * Update a single notification
	 */
	const updateNotification = async (id: string, notification: Partial<AppNotification>) => {
		try {
			// Type cast to work with SDK function
			return await client.value.request(updateNotificationSdk(id, notification as any));
		} catch (error) {
			console.error(`Error updating notification with ID ${id}:`, error);
			throw error;
		}
	};

	/**
	 * Update multiple notifications
	 */
	const updateNotifications = async (
		ids: string[] | Record<string, any>,
		notifications: Record<string, Partial<AppNotification>>,
	) => {
		try {
			// Type cast to work with SDK function
			if (Array.isArray(ids)) {
				return await client.value.request(updateNotificationsSdk(ids, notifications as any));
			} else {
				throw new Error('Invalid argument: ids must be an array of strings');
			}
		} catch (error) {
			console.error('Error updating multiple notifications:', error);
			throw error;
		}
	};

	/**
	 * Delete a single notification
	 */
	const deleteNotification = async (id: string) => {
		try {
			return await client.value.request(deleteNotificationSdk(id));
		} catch (error) {
			console.error(`Error deleting notification with ID ${id}:`, error);
			throw error;
		}
	};

	/**
	 * Delete multiple notifications
	 */
	const deleteNotifications = async (ids: string[] | Record<string, any>) => {
		try {
			if (Array.isArray(ids)) {
				return await client.value.request(deleteNotificationsSdk(ids));
			} else {
				throw new Error('Invalid argument: ids must be an array of strings');
			}
		} catch (error) {
			console.error('Error deleting multiple notifications:', error);
			throw error;
		}
	};

	/**
	 * Mark a notification as read
	 */
	const markAsRead = async (id: string) => {
		try {
			// Type cast to work with SDK function
			return await client.value.request(
				updateNotificationSdk(id, {
					read: true,
					read_at: new Date().toISOString(),
				} as any),
			);
		} catch (error) {
			console.error(`Error marking notification ${id} as read:`, error);
			throw error;
		}
	};

	/**
	 * Mark multiple notifications as read
	 */
	const markMultipleAsRead = async (ids: string[]) => {
		try {
			// Using individual update requests instead of batch update
			const now = new Date().toISOString();
			const promises = ids.map((id) =>
				client.value.request(
					updateNotificationSdk(id, {
						read: true,
						read_at: now,
					} as any),
				),
			);

			return await Promise.all(promises);
		} catch (error) {
			console.error('Error marking multiple notifications as read:', error);
			throw error;
		}
	};

	/**
	 * Get unread notifications count
	 */
	const getUnreadCount = async (userId?: string, organizationId?: string | null) => {
		try {
			// Build filter
			const filter: Record<string, any> = {
				read: { _eq: false },
			};

			// Add user filter if provided
			if (userId) {
				filter.recipient = { _eq: userId };
			}

			// Add organization filter if provided
			if (organizationId) {
				filter.organization = { _eq: organizationId };
			}

			const query = {
				filter,
				aggregate: { count: 'id' },
			};

			const result = await client.value.request(readNotificationsSdk(query));

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
