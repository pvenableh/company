<template>
	<div>
		<!-- Notification Bell with Popover -->
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
				<div class="w-96 max-h-[70vh] overflow-y-auto">
					<!-- Header -->
					<div class="flex items-center justify-between p-4 border-b dark:border-gray-700">
						<p class="text-sm font-bold">Notifications</p>
						<div class="flex items-center gap-2">
							<UButton
								v-if="unreadCount > 0"
								size="xs"
								color="gray"
								variant="ghost"
								icon="i-heroicons-check"
								@click="handleMarkAllAsRead"
								:loading="isMarkingAll"
							>
								Mark all as read
							</UButton>
							<UButton
								size="xs"
								color="gray"
								variant="ghost"
								icon="i-heroicons-arrows-pointing-out"
								@click="openSlideover"
							>
								View all
							</UButton>
						</div>
					</div>

					<!-- Notifications List -->
					<div class="p-4">
						<div v-if="notifications?.length" class="space-y-4">
							<LayoutNotificationItem
								v-for="notification in notifications.slice(0, 5)"
								:key="notification.id"
								:notification="notification"
								:loading="loadingNotifications.has(notification.id)"
								@mark-read="handleMarkAsRead"
								@navigate="viewNotification"
								compact
							/>

							<div v-if="notifications.length > 5" class="text-center pt-2 border-t dark:border-gray-700">
								<UButton size="xs" variant="link" class="text-[var(--cyan)]" @click="openSlideover">
									View all notifications
								</UButton>
							</div>
						</div>

						<div v-else-if="isLoading" class="text-center py-8">
							<UIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5 mx-auto mb-2" />
							<p class="text-gray-500">Loading notifications...</p>
						</div>

						<div v-else class="text-center py-8 text-gray-500">No new notifications</div>
					</div>
				</div>
			</template>
		</UPopover>

		<!-- Full Notifications Slideover -->
		<USlideover
			v-model="isSlideoverOpen"
			:ui="{
				width: 'sm:max-w-lg',
				padding: 'p-0',
			}"
		>
			<div class="flex h-full flex-col">
				<!-- Slideover Header -->
				<div class="px-4 py-6 sm:px-6 bg-white dark:bg-gray-800 border-b dark:border-gray-700">
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-bold">Notifications</h3>
						<div class="ml-3 flex h-7 items-center">
							<UButton
								color="gray"
								variant="ghost"
								icon="i-heroicons-x-mark"
								aria-label="Close panel"
								@click="isSlideoverOpen = false"
							/>
						</div>
					</div>
					<p class="mt-1 text-sm text-gray-500">
						{{ unreadCount }} unread notification{{ unreadCount !== 1 ? 's' : '' }}
					</p>
				</div>

				<!-- Actions and Filters -->
				<div class="px-4 py-3 sm:px-6 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="flex items-center space-x-2">
							<UButton
								v-if="unreadCount > 0"
								size="sm"
								color="cyan"
								@click="handleMarkAllAsRead"
								:loading="isMarkingAll"
							>
								Mark All as Read
							</UButton>

							<USelect
								v-model="statusFilter"
								:options="statusOptions"
								size="sm"
								placeholder="Filter by Status"
								class="w-40"
							/>
						</div>

						<UButton
							size="sm"
							color="gray"
							variant="soft"
							icon="i-heroicons-cog-6-tooth"
							@click="showSettings = !showSettings"
						>
							Settings
						</UButton>
					</div>
				</div>

				<!-- Settings Panel -->
				<UCard v-if="showSettings" class="mx-4 my-3 bg-gray-50 dark:bg-gray-800">
					<template #header>
						<div class="flex items-center justify-between">
							<h3 class="text-sm font-medium">Notification Settings</h3>
							<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" size="xs" @click="showSettings = false" />
						</div>
					</template>

					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<div>
								<div class="font-medium text-sm">Sound Alerts</div>
								<div class="text-xs text-gray-500">Play sound when new notifications arrive</div>
							</div>
							<UToggle v-model="preferences.soundEnabled" />
						</div>

						<div class="flex items-center justify-between">
							<div>
								<div class="font-medium text-sm">Email Notifications</div>
								<div class="text-xs text-gray-500">Receive email for important notifications</div>
							</div>
							<UToggle v-model="preferences.emailEnabled" />
						</div>
					</div>

					<template #footer>
						<div class="flex justify-end gap-2">
							<UButton color="primary" size="sm" @click="savePreferences">Save Settings</UButton>
						</div>
					</template>
				</UCard>

				<!-- Notifications List with Infinite Scroll -->
				<div class="relative flex-1 overflow-auto" ref="notificationsContainer">
					<div
						v-if="isLoading && !filteredNotifications.length"
						class="absolute inset-0 flex items-center justify-center"
					>
						<UIcon name="i-heroicons-arrow-path" class="animate-spin h-10 w-10 text-gray-300" />
					</div>

					<div v-else-if="filteredNotifications.length === 0" class="flex flex-col items-center justify-center h-full">
						<UIcon name="i-heroicons-bell-slash" class="h-16 w-16 text-gray-300 mb-4" />
						<p class="text-lg text-gray-500">No notifications</p>
						<p class="text-sm text-gray-400">
							{{
								statusFilter === 'archived'
									? "You don't have any read notifications"
									: "You don't have any unread notifications"
							}}
						</p>
					</div>

					<div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
						<LayoutNotificationItem
							v-for="notification in filteredNotifications"
							:key="notification.id"
							:notification="notification"
							:loading="loadingNotifications.has(notification.id)"
							:is-archived="isRead(notification)"
							@mark-read="handleMarkAsRead"
							@navigate="viewNotification"
							class="px-4 py-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
						/>

						<!-- Loading indicator for infinite scroll -->
						<div v-if="isLoadingMore" class="py-4 text-center">
							<UIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5 mx-auto text-gray-400" />
							<p class="text-xs text-gray-500 mt-2">Loading more notifications...</p>
						</div>

						<!-- End of list message -->
						<div
							v-if="!hasMoreToLoad && filteredNotifications.length > 0"
							class="py-4 text-center text-sm text-gray-500"
						>
							End of notifications
						</div>

						<!-- VueUse infinite scroll target element -->
						<div v-if="hasMoreToLoad" ref="loadMoreTrigger" class="h-1"></div>
					</div>
				</div>
			</div>
		</USlideover>
	</div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useInfiniteScroll } from '@vueuse/core';
import { useNotifications } from '~/composables/useNotifications';

const { user } = useDirectusAuth();
const config = useRuntimeConfig();
const {
	notifications,
	archivedNotifications,
	archivedPagination,
	isLoadingArchived,
	fetchArchivedNotifications,
	loadMoreArchivedNotifications,
	unreadCount,
	loadingNotifications,
	markAsRead,
	markAllAsRead,
	userPreferences,
	savePreferences: saveUserPreferences,
	navigateToItem,
} = useNotifications();

const isLoading = ref(false);
const isSlideoverOpen = ref(false);
const showSettings = ref(false);
const isMarkingAll = ref(false);
const statusFilter = ref('inbox');
const preferences = ref({ ...userPreferences.value });
const notificationsContainer = ref(null);
const loadMoreTrigger = ref(null);

// Status filter options
const statusOptions = [
	{ label: 'Unread', value: 'inbox' },
	{ label: 'Read', value: 'archived' },
];

// Computed properties for pagination
const hasMoreToLoad = computed(() => {
	return statusFilter.value === 'archived' && archivedPagination.value.hasMore;
});

const isLoadingMore = computed(() => {
	return statusFilter.value === 'archived' && isLoadingArchived.value;
});

// Set up infinite scroll using VueUse
useInfiniteScroll(
	loadMoreTrigger,
	() => {
		if (statusFilter.value === 'archived' && !isLoadingArchived.value && archivedPagination.value.hasMore) {
			loadMoreArchivedNotifications();
		}
	},
	{
		distance: 200, // Load more when within 200px of the bottom
		throttle: 300, // Throttle scroll events
	},
);

watch(statusFilter, async (newValue) => {
	if (newValue === 'archived' && archivedNotifications.value.length === 0) {
		await fetchArchivedNotifications(true); // Reset and fetch archived notifications
	}
});

// Watch for slideover opening to ensure we have the right notifications
watch(isSlideoverOpen, async (isOpen) => {
	if (isOpen && statusFilter.value === 'archived' && archivedNotifications.value.length === 0) {
		await fetchArchivedNotifications(true);
	}
});

// Filtered notifications based on status
const filteredNotifications = computed(() => {
	if (statusFilter.value === 'inbox') {
		return notifications.value; // Already filtered to inbox status
	} else {
		return archivedNotifications.value; // Archived notifications
	}
});

// Check if notification is already read
const isRead = (notification) => {
	return notification.status === 'archived';
};

// Open slideover
const openSlideover = () => {
	isSlideoverOpen.value = true;

	// Reset status filter to show unread notifications by default when opening slideover
	statusFilter.value = 'inbox';
};

// Handle marking notification as read
const handleMarkAsRead = async (notificationId) => {
	try {
		await markAsRead(notificationId);
	} catch (error) {
		useToast().add({
			id: 'notification-error',
			title: 'Error',
			description: 'Failed to mark notification as read',
			color: 'red',
		});
	}
};

// Handle marking all notifications as read
const handleMarkAllAsRead = async () => {
	try {
		isMarkingAll.value = true;
		await markAllAsRead();
	} catch (error) {
		useToast().add({
			id: 'notification-error',
			title: 'Error',
			description: 'Failed to mark all notifications as read',
			color: 'red',
		});
	} finally {
		isMarkingAll.value = false;
	}
};

// View notification and navigate to item
const viewNotification = (notification) => {
	// First mark as read if unread
	if (!isRead(notification)) {
		handleMarkAsRead(notification.id);
	}

	// Navigate to the item and close the slideover
	navigateToItem(notification);

	// Close slideover
	isSlideoverOpen.value = false;
};

// Save notification preferences
const savePreferences = async () => {
	await saveUserPreferences(preferences.value);
	showSettings.value = false;
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
