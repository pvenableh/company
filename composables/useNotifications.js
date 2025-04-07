// composables/useNotifications.js
import { ref, computed, watchEffect } from 'vue';
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';

export function useNotifications() {
	const config = useRuntimeConfig();
	const { readNotifications, createNotification, updateNotification } = useDirectusNotifications();
	const { data: authData, status } = useAuth();
	const user = computed(() => {
		return status.value === 'authenticated' ? authData?.value?.user ?? null : null;
	});
	const toast = useToast();

	// Initialize data ref
	const data = ref([]);
	const archivedNotifications = ref([]);
	const isLoadingArchived = ref(false);
	const loadingNotifications = ref(new Set());

	// Pagination state
	const archivedPagination = ref({
		page: 1,
		limit: 25,
		totalPages: 0,
		totalItems: 0,
		hasMore: true,
	});

	// Shared state for preferences
	const userPreferences = useState('notification-prefs', () => ({
		soundEnabled: true,
		emailEnabled: true,
		desktopEnabled: true,
	}));

	// Notification sound setup
	const notificationSound = import.meta.client ? new Audio('/sounds/notification.mp3') : null;

	// Play notification sound if enabled
	const playSound = () => {
		if (import.meta.client && notificationSound && userPreferences.value.soundEnabled) {
			notificationSound.play().catch((err) => console.error('Failed to play notification sound:', err));
		}
	};

	// Create a plain filter object instead of a computed
	const getNotificationFilter = () => ({
		_and: [
			{ status: { _eq: 'inbox' } },
			{ recipient: { _eq: user.value?.id } },
			{ sender: { id: { _neq: user.value?.id } } },
		],
	});

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

	const {
		data: realtimeData,
		refresh,
		isConnected,
		error,
		lastUpdated,
	} = useRealtimeSubscription('directus_notifications', subscriptionFields, getNotificationFilter(), '-timestamp');

	// Fetch archived notifications with pagination
	const fetchArchivedNotifications = async (reset = false) => {
		if (isLoadingArchived.value) return;

		if (reset) {
			archivedNotifications.value = [];
			archivedPagination.value.page = 1;
			archivedPagination.value.hasMore = true;
		}

		// If we don't have more pages, exit early
		if (!archivedPagination.value.hasMore) return;

		isLoadingArchived.value = true;
		try {
			const response = await readNotifications({
				filter: {
					_and: [{ status: { _eq: 'archived' } }, { recipient: { _eq: user.value?.id } }],
				},
				fields: [...subscriptionFields, 'collection.name', 'collection.icon'],
				sort: ['-timestamp'],
				limit: archivedPagination.value.limit,
				page: archivedPagination.value.page,
				meta: 'filter_count,total_count',
			});

			// Update pagination info if meta data is available
			if (response?.meta) {
				archivedPagination.value.totalItems = response.meta.total_count;
				archivedPagination.value.totalPages = Math.ceil(response.meta.total_count / archivedPagination.value.limit);
				archivedPagination.value.hasMore = archivedPagination.value.page < archivedPagination.value.totalPages;
			} else {
				// If no metadata but no items returned, we've reached the end
				archivedPagination.value.hasMore = response && response.length === archivedPagination.value.limit;
			}

			// Append new items to existing ones
			if (reset) {
				archivedNotifications.value = response || [];
			} else {
				archivedNotifications.value = [...archivedNotifications.value, ...(response || [])];
			}

			// Increment page for next request
			archivedPagination.value.page++;
		} catch (error) {
			console.error('Error fetching archived notifications:', error);
		} finally {
			isLoadingArchived.value = false;
		}
	};

	// Load next page of archived notifications
	const loadMoreArchivedNotifications = async () => {
		if (!isLoadingArchived.value && archivedPagination.value.hasMore) {
			await fetchArchivedNotifications(false);
		}
	};

	// Clear cached archived notifications when user changes
	watch(
		() => user.value?.id,
		() => {
			archivedNotifications.value = [];
			archivedPagination.value.page = 1;
			archivedPagination.value.hasMore = true;
		},
	);

	// Update local data when realtime data changes and detect new notifications
	const previousCount = ref(0);

	// Update local data when realtime data changes and detect new notifications
	watchEffect(() => {
		if (realtimeData.value) {
			// Check if we have new notifications
			const currentCount = realtimeData.value.length;

			// If we have more notifications than before, show toast and play sound
			if (currentCount > previousCount.value && previousCount.value > 0) {
				// Get the newest notification (should be first in the array)
				const newNotification = realtimeData.value[0];
				if (newNotification) {
					showToastNotification(newNotification);
					playSound();
				}
			}

			previousCount.value = currentCount;
			data.value = realtimeData.value;
		}
	});

	const unreadCount = computed(() => data.value?.length || 0);

	// Show toast notification for new notifications
	const showToastNotification = (notification) => {
		const sender = notification.sender?.first_name
			? `${notification.sender.first_name} ${notification.sender.last_name}`
			: 'System';

		toast.add({
			title: notification.subject,
			description: stripHtmlTags(notification.message),
			icon: getNotificationIcon(notification),
			avatar: notification.sender?.avatar
				? `${config.public.directusUrl}/assets/${notification.sender.avatar}?key=small`
				: null,
			color: 'primary',
			timeout: 7000,
			actions: [
				{
					label: 'View',
					click: () => navigateToItem(notification),
				},
			],
		});
	};

	// Get appropriate icon based on notification type
	const getNotificationIcon = (notification) => {
		if (!notification.collection) return 'i-heroicons-bell-alert';

		const iconMap = {
			tickets: 'i-heroicons-ticket',
			projects: 'i-heroicons-folder',
			tasks: 'i-heroicons-check-circle',
			comments: 'i-heroicons-chat-bubble-left',
			invoices: 'i-heroicons-document-text',
		};

		return iconMap[notification.collection] || 'i-heroicons-bell-alert';
	};

	// Strip HTML tags for toast notifications
	const stripHtmlTags = (html) => {
		if (!html) return '';
		return html.replace(/<[^>]*>?/gm, '');
	};

	// Navigate to the relevant item when notification is clicked
	const navigateToItem = async (notification) => {
		markAsRead(notification.id);

		if (!notification.collection || !notification.item) return;

		const router = useRouter();
		try {
			// Special handling for tasks - they need to redirect to their parent ticket
			if (notification.collection === 'tasks') {
				const taskLink = await getTaskNotificationLink(notification.item);
				if (taskLink) {
					router.push(taskLink);
					return;
				}
			}

			// Standard routes for other item types
			const routeMap = {
				tickets: `/tickets/${notification.item}`,
				projects: `/projects/${notification.item}`,
				comments: `/${notification.collection}/${notification.item}`,
				invoices: `/invoices/${notification.item}`,
			};

			const route = routeMap[notification.collection];
			if (route) {
				router.push(route);
			}
		} catch (error) {
			console.error('Navigation error:', error);
			// Fallback to dashboard if navigation fails
			router.push('/dashboard');
		}
	};

	// Save user preferences
	const savePreferences = async (prefs) => {
		if (!user.value?.id) return;

		try {
			userPreferences.value = { ...userPreferences.value, ...prefs };

			// For now, just use localStorage
			if (import.meta.client) {
				localStorage.setItem('notification_prefs', JSON.stringify(userPreferences.value));
			}
		} catch (err) {
			console.error('Failed to save notification preferences:', err);
		}
	};

	// Load user preferences
	const loadPreferences = () => {
		if (import.meta.client) {
			const saved = localStorage.getItem('notification_prefs');
			if (saved) {
				try {
					userPreferences.value = JSON.parse(saved);
				} catch (e) {
					console.error('Failed to parse notification preferences:', e);
				}
			}
		}
	};

	const markAsRead = async (notificationId) => {
		loadingNotifications.value.add(notificationId);
		try {
			await updateNotification(notificationId, {
				status: 'archived',
			});
			// Refresh the subscription after updating
			refresh();

			// Reset archived notifications as they need to be reloaded
			archivedNotifications.value = [];
			archivedPagination.value.page = 1;
			archivedPagination.value.hasMore = true;
		} catch (error) {
			throw error;
		} finally {
			loadingNotifications.value.delete(notificationId);
		}
	};

	// Mark all notifications as read
	const markAllAsRead = async () => {
		try {
			if (data.value.length === 0) return;

			// Create an array of promises to update all notifications
			const updatePromises = data.value.map((notification) =>
				updateNotification(notification.id, {
					status: 'archived',
				}),
			);

			await Promise.all(updatePromises);

			// Refresh to update the UI
			refresh();

			// Reset archived notifications cache as it's now outdated
			archivedNotifications.value = [];
			archivedPagination.value.page = 1;
			archivedPagination.value.hasMore = true;
		} catch (error) {
			console.error('Failed to mark all notifications as read:', error);
		}
	};

	const notify = async ({ recipient, subject, message, collection, item, sender }) => {
		// Skip notification if user is notifying themselves
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
				sender: sender || user.value?.id,
				status: 'inbox',
			});
			// Refresh the subscription after creating new notification
			refresh();
		} catch (error) {
			throw error;
		}
	};

	// Notify multiple recipients with the same message
	const notifyMany = async ({ recipients, subject, message, collection, item, sender }) => {
		if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
			console.error('Valid recipients array is required for notifications');
			return [];
		}

		// Filter out current user
		const filteredRecipients = recipients.filter((id) => id !== user.value?.id);

		if (filteredRecipients.length === 0) return [];

		try {
			const senderId = sender || user.value?.id;
			const createPromises = filteredRecipients.map((recipient) =>
				createNotification({
					recipient,
					subject,
					message,
					collection,
					item,
					sender: senderId,
					status: 'inbox',
				}),
			);

			const results = await Promise.all(createPromises);
			refresh();
			return results;
		} catch (error) {
			console.error('Failed to send notifications:', error);
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
			previousCount.value = initialNotifications.length;
		} catch (error) {
			console.error('Error loading notifications:', error);
		}
	};

	// Load initial data when user is available
	watchEffect(() => {
		if (user.value?.id) {
			loadNotifications();
			// Load saved preferences
			if (import.meta.client) {
				loadPreferences();
			}
			// Refresh the subscription when user changes
			refresh();
		}
	});

	return {
		// State
		notifications: data,
		archivedNotifications,
		isLoadingArchived,
		archivedPagination: readonly(archivedPagination),

		unreadCount,
		loadingNotifications: readonly(loadingNotifications),
		isConnected: readonly(isConnected),
		error: readonly(error),
		lastUpdated: readonly(lastUpdated),
		userPreferences,

		// Methods
		fetchArchivedNotifications,
		loadMoreArchivedNotifications,
		markAsRead,
		markAllAsRead,
		notify,
		notifyMany,
		refresh,
		navigateToItem,
		savePreferences,
		playSound,
	};
}

// For backward compatibility
export const notify = async (options) => {
	const { notify: sendNotification } = useNotifications();
	return await sendNotification(options);
};
