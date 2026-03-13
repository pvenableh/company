<template>
	<div>
		<!-- Notification Bell with Popover -->
		<Popover v-model:open="isPopoverOpen">
			<PopoverTrigger as-child>
				<button
					class="flex items-center justify-center relative rounded-full h-8 w-8 bg-white dark:bg-gray-800 shadow hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
					:disabled="!user"
				>
					<BellRing
						v-if="unreadCount"
						class="size-4 animate-ping absolute text-[var(--cyan)] opacity-50"
					/>
					<component :is="unreadCount ? BellRing : Bell" class="size-4" />
					<div
						v-if="unreadCount > 0"
						class="absolute -top-1 -right-1 text-[9px] leading-3 rounded-full h-4 w-4 bg-[var(--cyan)] flex items-center justify-center text-white font-bold p-1"
					>
						{{ unreadCount }}
					</div>
				</button>
			</PopoverTrigger>

			<PopoverContent align="end" :side-offset="8" class="w-96 max-h-[70vh] overflow-y-auto p-0">
				<!-- Header -->
				<div class="flex items-center justify-between p-4 border-b dark:border-gray-700">
					<p class="text-sm font-bold">Notifications</p>
					<div class="flex items-center gap-2">
						<Button
							v-if="unreadCount > 0"
							variant="ghost"
							size="sm"
							class="h-7 text-xs"
							:disabled="isMarkingAll"
							@click="handleMarkAllAsRead"
						>
							<Check class="size-3 mr-1" />
							Mark all as read
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 text-xs"
							@click="openSheet"
						>
							<Maximize2 class="size-3 mr-1" />
							View all
						</Button>
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
							<Button variant="link" size="sm" class="text-[var(--cyan)] text-xs" @click="openSheet">
								View all notifications
							</Button>
						</div>
					</div>

					<div v-else-if="isLoading" class="text-center py-8">
						<Loader2 class="size-5 animate-spin mx-auto mb-2 text-muted-foreground" />
						<p class="text-gray-500 text-sm">Loading notifications...</p>
					</div>

					<div v-else class="text-center py-8 text-gray-500 text-sm">No new notifications</div>
				</div>
			</PopoverContent>
		</Popover>

		<!-- Full Notifications Sheet -->
		<Sheet v-model:open="isSheetOpen">
			<SheetContent side="right" class="sm:max-w-lg p-0 flex flex-col" :show-close-button="false">
				<!-- Sheet Header -->
				<SheetHeader class="px-6 py-4 border-b dark:border-gray-700 space-y-0">
					<div class="flex items-center justify-between">
						<SheetTitle class="text-lg">Notifications</SheetTitle>
						<SheetClose as-child>
							<Button variant="ghost" size="icon-sm">
								<X class="size-4" />
							</Button>
						</SheetClose>
					</div>
					<SheetDescription>
						{{ unreadCount }} unread notification{{ unreadCount !== 1 ? 's' : '' }}
					</SheetDescription>
				</SheetHeader>

				<!-- Actions and Filters -->
				<div class="px-6 py-3 bg-muted/50 border-b dark:border-gray-700">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="flex items-center space-x-2">
							<Button
								v-if="unreadCount > 0"
								size="sm"
								class="bg-[var(--cyan)] hover:bg-[var(--cyan)]/90 text-white"
								:disabled="isMarkingAll"
								@click="handleMarkAllAsRead"
							>
								Mark All as Read
							</Button>

							<Select v-model="statusFilter">
								<SelectTrigger class="w-28 h-8">
									<SelectValue placeholder="Filter" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="inbox">Unread</SelectItem>
									<SelectItem value="archived">Read</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<Button
							variant="outline"
							size="sm"
							@click="showSettings = !showSettings"
						>
							<Settings class="size-3.5 mr-1" />
							Settings
						</Button>
					</div>

					<!-- Type filter chips -->
					<div class="flex flex-wrap gap-1.5 mt-2">
						<button
							v-for="tf in typeFilters"
							:key="tf.value"
							class="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
							:class="typeFilter === tf.value
								? 'bg-primary text-primary-foreground'
								: 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'"
							@click="typeFilter = tf.value"
						>
							{{ tf.label }}
						</button>
					</div>
				</div>

				<!-- Settings Panel -->
				<div v-if="showSettings" class="mx-4 my-3 border rounded-lg">
					<div class="flex items-center justify-between p-4 pb-2">
						<h3 class="text-sm font-medium">Notification Settings</h3>
						<Button variant="ghost" size="icon-sm" class="size-6" @click="showSettings = false">
							<X class="size-3" />
						</Button>
					</div>

					<div class="space-y-4 p-4 pt-2">
						<div class="flex items-center justify-between">
							<div>
								<div class="font-medium text-sm">Sound Alerts</div>
								<div class="text-xs text-muted-foreground">Play sound when new notifications arrive</div>
							</div>
							<Switch :checked="preferences.soundEnabled" @update:checked="preferences.soundEnabled = $event" />
						</div>

						<div class="flex items-center justify-between">
							<div>
								<div class="font-medium text-sm">Email Notifications</div>
								<div class="text-xs text-muted-foreground">Receive email for important notifications</div>
							</div>
							<Switch :checked="preferences.emailEnabled" @update:checked="preferences.emailEnabled = $event" />
						</div>
					</div>

					<div class="flex justify-end gap-2 p-4 pt-2 border-t">
						<Button size="sm" @click="savePreferences">Save Settings</Button>
					</div>
				</div>

				<!-- Notifications List with Infinite Scroll -->
				<div class="relative flex-1 overflow-auto" ref="notificationsContainer">
					<div
						v-if="isLoading && !filteredNotifications.length"
						class="absolute inset-0 flex items-center justify-center"
					>
						<Loader2 class="size-10 animate-spin text-muted-foreground" />
					</div>

					<div v-else-if="filteredNotifications.length === 0" class="flex flex-col items-center justify-center h-full">
						<BellOff class="size-16 text-muted-foreground/30 mb-4" />
						<p class="text-lg text-muted-foreground">No notifications</p>
						<p class="text-sm text-muted-foreground/70">
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
							<Loader2 class="size-5 animate-spin mx-auto text-muted-foreground" />
							<p class="text-xs text-muted-foreground mt-2">Loading more notifications...</p>
						</div>

						<!-- End of list message -->
						<div
							v-if="!hasMoreToLoad && filteredNotifications.length > 0"
							class="py-4 text-center text-sm text-muted-foreground"
						>
							End of notifications
						</div>

						<!-- VueUse infinite scroll target element -->
						<div v-if="hasMoreToLoad" ref="loadMoreTrigger" class="h-1"></div>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	</div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useInfiniteScroll } from '@vueuse/core';
import { useNotifications } from '~/composables/useNotifications';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Bell, BellRing, BellOff, Check, Maximize2, Loader2, X, Settings } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const { user } = useDirectusAuth();
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
const isPopoverOpen = ref(false);
const isSheetOpen = ref(false);
const showSettings = ref(false);
const isMarkingAll = ref(false);
const statusFilter = ref('inbox');
const typeFilter = ref('all');
const preferences = ref({ ...userPreferences.value });
const notificationsContainer = ref(null);
const loadMoreTrigger = ref(null);

// Status filter options
const statusOptions = [
	{ label: 'Unread', value: 'inbox' },
	{ label: 'Read', value: 'archived' },
];

// Type filter options
const typeFilters = [
	{ label: 'All', value: 'all' },
	{ label: 'Mentions', value: 'mention' },
	{ label: 'Comments', value: 'comment' },
	{ label: 'Assignments', value: 'assignment' },
	{ label: 'Messages', value: 'message' },
];

// Map collection names to notification types for filtering
function getNotificationType(notification) {
	// If the notification has a type metadata field, use it
	if (notification.type) return notification.type;

	// Infer type from collection
	const collectionTypeMap = {
		comments: 'comment',
		messages: 'message',
		tickets: 'assignment',
		projects: 'assignment',
		project_tasks: 'assignment',
		invoices: 'invoice',
	};

	// Check subject for mention keywords
	const subject = (notification.subject || '').toLowerCase();
	if (subject.includes('mention')) return 'mention';
	if (subject.includes('assign')) return 'assignment';
	if (subject.includes('react')) return 'reaction';

	return collectionTypeMap[notification.collection] || 'system';
}

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
		distance: 200,
		throttle: 300,
	},
);

watch(statusFilter, async (newValue) => {
	if (newValue === 'archived' && archivedNotifications.value.length === 0) {
		await fetchArchivedNotifications(true);
	}
});

watch(isSheetOpen, async (isOpen) => {
	if (isOpen && statusFilter.value === 'archived' && archivedNotifications.value.length === 0) {
		await fetchArchivedNotifications(true);
	}
});

// Filtered notifications based on status and type
const filteredNotifications = computed(() => {
	const source = statusFilter.value === 'inbox'
		? notifications.value
		: archivedNotifications.value;

	// Apply type filter
	if (typeFilter.value === 'all') return source;

	return source.filter((n) => getNotificationType(n) === typeFilter.value);
});

const isRead = (notification) => {
	return notification.status === 'archived';
};

const openSheet = () => {
	isPopoverOpen.value = false;
	isSheetOpen.value = true;
	statusFilter.value = 'inbox';
};

const handleMarkAsRead = async (notificationId) => {
	try {
		await markAsRead(notificationId);
	} catch (error) {
		toast.error('Failed to mark notification as read');
	}
};

const handleMarkAllAsRead = async () => {
	try {
		isMarkingAll.value = true;
		await markAllAsRead();
	} catch (error) {
		toast.error('Failed to mark all notifications as read');
	} finally {
		isMarkingAll.value = false;
	}
};

const viewNotification = (notification) => {
	if (!isRead(notification)) {
		handleMarkAsRead(notification.id);
	}

	navigateToItem(notification);

	isPopoverOpen.value = false;
	isSheetOpen.value = false;
};

const savePreferences = async () => {
	await saveUserPreferences(preferences.value);
	showSettings.value = false;
};

watch(
	() => notifications.value,
	(newVal) => {
		isLoading.value = !newVal;
	},
	{ immediate: true },
);
</script>
