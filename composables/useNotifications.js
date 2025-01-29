import { ref, computed, watchEffect } from 'vue';
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';

export function useNotifications() {
	const { readNotifications, createNotification, updateNotification } = useDirectusNotifications();
	const { user } = useDirectusAuth();

	// Initialize data ref
	const data = ref([]);

	// Create a plain filter object instead of a computed
	const getNotificationFilter = () => ({
		_and: [{ status: { _eq: 'inbox' } }, { recipient: { id: { _eq: user.value?.id } } }],
		// _and: [
		// 	{ status: { _eq: 'inbox' } },
		// 	{ recipient: { id: { _eq: user.value?.id } } },
		// 	{ sender: { id: { _neq: user.value?.id } } }
		//   ]
	});

	console.log(getNotificationFilter());

	// Set up realtime subscription when user is available
	const subscriptionFields = [
		'id',
		'timestamp',
		'status',
		'recipient',
		'sender.id',
		'sender.first_name',
		'sender.last_name',
		'sender.avatar',
		'subject',
		'message',
		'collection',
		'item',
	];

	const { data: realtimeData, refresh } = useRealtimeSubscription(
		'directus_notifications',
		subscriptionFields,
		getNotificationFilter(),
		'-timestamp',
	);

	// Update local data when realtime data changes
	watchEffect(() => {
		if (realtimeData.value) {
			data.value = realtimeData.value;
		}
	});

	const unreadCount = computed(() => data.value?.length || 0);

	const markAsRead = async (notificationId) => {
		try {
			await updateNotification(notificationId, {
				status: 'archived',
			});
			// Refresh the subscription after updating
			refresh();
		} catch (error) {
			console.error('Error marking notification as read:', error);
			throw error;
		}
	};

	const notify = async ({ recipient, subject, message, collection, item, sender }) => {
		if (recipient === user.value?.id) {
			return;
		}
		try {
			await createNotification({
				recipient,
				subject,
				message,
				collection,
				item,
				sender,
				status: 'inbox',
			});
			// Refresh the subscription after creating new notification
			refresh();
		} catch (error) {
			console.error('Error creating notification:', error);
			throw error;
		}
	};

	// Load initial notifications
	const loadNotifications = async () => {
		if (!user.value?.id) return;

		try {
			const initialNotifications = await readNotifications({
				filter: getNotificationFilter(),
				fields: subscriptionFields,
				sort: ['-timestamp'],
			});
			data.value = initialNotifications;
		} catch (error) {
			console.error('Error loading notifications:', error);
		}
	};

	// Load initial data when user is available
	watchEffect(() => {
		if (user.value?.id) {
			loadNotifications();
			// Refresh the subscription when user changes
			refresh();
		}
	});

	return {
		notifications: data,
		unreadCount,
		markAsRead,
		notify,
		refresh,
	};
}
