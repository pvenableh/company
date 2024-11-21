<template>
	<div>
		<h1>Real-Time Notifications</h1>

		{{ notifications }}
		<ul>
			<li v-for="notification in notifications" :key="notification.id">
				{{ notification.subject }} - {{ notification.message }}
			</li>
		</ul>
	</div>
</template>

<script setup>
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';
const { readNotifications, createNotification, updateNotification } = useDirectusNotifications();
const { user } = useDirectusAuth();

const { data: notifications } = useRealtimeSubscription(
	'notifications',
	['*', 'sender.*', 'recipient.*'],
	{
		status: { _eq: 'inbox' },
		recipient: { _eq: user.value?.id },
	},
	'-timestamp',
);

const fetchNotifications = async () => {
	try {
		const newer = await readNotifications();
		console.log(newer);
	} catch (error) {
		console.error('Error fetching notifications:', error);
	}
};

const unreadCount = computed(() => notifications.value?.length || 0);

const markAsRead = async (notificationId) => {
	try {
		await updateNotification(notificationId, {
			status: 'archived',
		});
	} catch (error) {
		console.error('Error marking notification as read:', error);
	}
};

const notify = async ({ recipient, subject, message, collection, item }) => {
	try {
		await createNotification({
			recipient,
			sender: user.value.id,
			subject,
			message,
			collection,
			item,
			status: 'inbox',
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error('Error creating notification:', error);
	}
};

onMounted(fetchNotifications);
</script>
