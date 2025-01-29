<template>
	<UPopover mode="click" :disabled="!user">
		<div class="flex items-center justify-center relative rounded-full h-8 w-8 bg-white dark:bg-gray-800 shadow">
			<UIcon
				v-if="unreadCount"
				name="i-heroicons-bell-alert"
				class="w-4 h-4 animate-ping absolute text--[var(--cyan)]"
			/>
			<UIcon :name="unreadCount ? 'i-heroicons-bell-alert' : 'i-heroicons-bell'" class="w-4 h-4" />
			<div
				v-if="unreadCount > 0"
				class="absolute -top-1 -right-1 text-[9px] leading-3 rounded-full h-4 w-4 bg-[var(--cyan)] flex items-center justify-center text-white font-bold p-1"
			>
				{{ unreadCount }}
			</div>
		</div>

		<template #panel>
			<div class="w-96 max-h-[70vh] overflow-y-auto p-4">
				<div v-if="notifications?.length" class="space-y-4">
					<div
						v-for="notification in notifications"
						:key="notification.id"
						class="flex items-start gap-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
					>
						<UAvatar
							:src="
								notification.sender?.avatar
									? `${config.public.directusUrl}/assets/${notification.sender.avatar}`
									: `https://ui-avatars.com/api/?name=${encodeURIComponent(notification.sender?.first_name + ' ' + notification.sender?.last_name)}&background=eeeeee&color=00bfff`
							"
							:alt="notification.sender?.first_name"
						/>

						<div class="flex-1 min-w-0">
							<p class="font-medium text-sm">{{ notification.subject }}</p>
							<div class="text-sm text-gray-500" v-html="notification.message" />
							<div class="flex items-center gap-2 mt-2 text-xs text-gray-400">
								<span class="uppercase font-bold">
									{{ getTimeAgo(new Date(notification.timestamp).toLocaleString()) }}
								</span>
								<UButton
									size="xs"
									variant="ghost"
									:loading="loadingNotifications.has(notification.id)"
									:disabled="loadingNotifications.has(notification.id)"
									@click="handleMarkAsRead(notification.id)"
								>
									Mark as read
								</UButton>
							</div>
						</div>
					</div>
				</div>
				<div v-else-if="isLoading" class="text-center py-8">
					<UIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5 mx-auto mb-2" />
					<p class="text-gray-500">Loading notifications...</p>
				</div>

				<div v-else class="text-center py-8 text-gray-500">No new notifications</div>
			</div>
		</template>
	</UPopover>
</template>

<script setup>
const { user } = useDirectusAuth();
const config = useRuntimeConfig();
const { notifications, unreadCount, markAsRead } = useNotifications();
const loadingNotifications = ref(new Set());
const isLoading = ref(false);
console.log('notifications');
console.log(notifications);

const handleMarkAsRead = async (notificationId) => {
	if (loadingNotifications.value.has(notificationId)) return;

	loadingNotifications.value.add(notificationId);

	try {
		await markAsRead(notificationId);
	} catch (error) {
		// Error is already logged in the markAsRead function
		useToast().add({
			id: 'notification-error',
			title: 'Error',
			description: 'Failed to mark notification as read',
			color: 'red',
		});
	} finally {
		loadingNotifications.value.delete(notificationId);
	}
};

const formatDate = (date) => {
	return new Date(date).toLocaleString();
};

// If your notifications are loaded asynchronously,
// you might want to add a watch effect:
watch(
	() => notifications.value,
	(newVal) => {
		isLoading.value = !newVal;
	},
	{ immediate: true },
);
</script>
