<template>
	<UPopover mode="click">
		<UButton icon="i-heroicons-bell" color="gray" variant="ghost" :class="{ 'animate-bounce': unreadCount > 0 }">
			<UBadge v-if="unreadCount > 0" :label="unreadCount" color="red" class="absolute -top-1 -right-1" size="xs" />
		</UButton>

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
								notification.sender?.avatar ? `${config.public.directusUrl}/assets/${notification.sender.avatar}` : null
							"
							:alt="notification.sender?.first_name"
						/>

						<div class="flex-1 min-w-0">
							<p class="font-medium text-sm">{{ notification.subject }}</p>
							<div class="text-sm text-gray-500" v-html="notification.message" />
							<div class="flex items-center gap-2 mt-2 text-xs text-gray-400">
								<span>{{ formatDate(notification.timestamp) }}</span>
								<UButton size="xs" variant="ghost" @click="markAsRead(notification.id)">Mark as read</UButton>
							</div>
						</div>
					</div>
				</div>

				<div v-else class="text-center py-8 text-gray-500">No new notifications</div>
			</div>
		</template>
	</UPopover>
</template>

<script setup>
const config = useRuntimeConfig();
const { notifications, unreadCount, markAsRead } = useNotifications();
console.log('notifications');
console.log(notifications);

const formatDate = (date) => {
	return new Date(date).toLocaleString();
};
</script>
