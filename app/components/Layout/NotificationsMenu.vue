<template>
	<div>
		<!-- Notification Bell with Popover -->
		<Popover v-model:open="isPopoverOpen">
			<PopoverTrigger as-child>
				<button
					class="flex items-center justify-center relative rounded-full h-8 w-8 hover:bg-muted/50 text-muted-foreground transition-colors"
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
							<Switch :model-value="preferences.soundEnabled" @update:model-value="preferences.soundEnabled = $event" />
						</div>

						<div class="flex items-center justify-between">
							<div>
								<div class="font-medium text-sm">Email Notifications</div>
								<div class="text-xs text-muted-foreground">Master switch — turn off to silence all email</div>
							</div>
							<Switch :model-value="preferences.emailEnabled" @update:model-value="preferences.emailEnabled = $event" />
						</div>

						<div class="pl-4 space-y-3 border-l-2 border-muted">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In-app + email</div>
							<div
								v-for="opt in emailableCategoryOptions"
								:key="opt.key"
								class="flex items-center justify-between"
							>
								<div>
									<div class="font-medium text-sm">{{ opt.label }}</div>
									<div class="text-xs text-muted-foreground">{{ opt.hint }}</div>
								</div>
								<Switch
									:model-value="preferences.categoryPrefs[opt.key] !== false"
									@update:model-value="preferences.categoryPrefs[opt.key] = $event"
								/>
							</div>
						</div>

						<div class="pl-4 space-y-3 border-l-2 border-muted">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In-app only</div>
							<div class="flex items-center justify-between">
								<div>
									<div class="font-medium text-sm">Reactions</div>
									<div class="text-xs text-muted-foreground">Bell only — reactions never send email</div>
								</div>
								<Switch
									:model-value="preferences.categoryPrefs.reactions !== false"
									@update:model-value="preferences.categoryPrefs.reactions = $event"
								/>
							</div>
						</div>

						<details class="pl-4 border-l-2 border-muted">
							<summary class="text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer">
								Per-meeting-type email controls
							</summary>
							<div class="space-y-3 mt-3">
								<div
									v-for="opt in meetingEmailOptions"
									:key="opt.key"
									class="flex items-center justify-between"
								>
									<div>
										<div class="font-medium text-sm">{{ opt.label }}</div>
										<div class="text-xs text-muted-foreground">{{ opt.hint }}</div>
									</div>
									<Switch
										:model-value="preferences.categoryPrefs[opt.key] !== false"
										@update:model-value="preferences.categoryPrefs[opt.key] = $event"
									/>
								</div>
							</div>
						</details>
					</div>

					<div class="flex justify-end gap-2 p-4 pt-2 border-t">
						<Button size="sm" :disabled="savingPrefs" @click="savePreferences">
							<Loader2 v-if="savingPrefs" class="size-3 mr-1 animate-spin" />
							Save Settings
						</Button>
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
// Local form state. Mirrors the composable's local-only flags PLUS the
// server-persisted email_notifications + the per-category/per-event-type
// opt-out map. Both top-level category keys (conversations, tickets,
// projects, invoices, contracts, proposals, meetings, reactions) AND the
// granular per-meeting-type keys (meeting_invited, …) live in the same
// flat `notification_preferences` JSON map. Missing keys default to opt-in.
const preferences = ref({
	...userPreferences.value,
	categoryPrefs: /** @type {Record<string, boolean>} */ ({}),
});
const savingPrefs = ref(false);

// Top-level categories that can send email. Reactions are deliberately
// excluded from this list — they render in a separate "In-app only"
// section because the email-delivery branch hardcodes a skip.
const emailableCategoryOptions = [
	{ key: 'conversations', label: 'Conversations', hint: 'Comments and replies on tickets, projects, and other items' },
	{ key: 'tickets', label: 'Tickets', hint: 'Status changes and new assignments' },
	{ key: 'projects', label: 'Projects', hint: 'Status changes, due-date shifts, and project completion' },
	{ key: 'invoices', label: 'Invoices', hint: 'When an invoice is issued or paid' },
	{ key: 'contracts', label: 'Contracts', hint: 'When a contract is sent or signed' },
	{ key: 'proposals', label: 'Proposals', hint: 'When a proposal is sent, accepted, or declined' },
	{ key: 'meetings', label: 'Meetings', hint: 'Invites, reschedules, reminders, cancellations' },
];

// Granular per-meeting-type controls. Tucked under a details/summary so the
// main panel stays tidy — most users just want the category toggle.
const meetingEmailOptions = [
	{ key: 'meeting_invited', label: 'Added to a meeting', hint: 'When someone adds you to a meeting' },
	{ key: 'meeting_time_changed', label: 'Time changed', hint: 'When a meeting you are on is rescheduled' },
	{ key: 'meeting_removed', label: 'Removed from a meeting', hint: 'When you are taken off a meeting' },
	{ key: 'meeting_cancelled', label: 'Meeting cancelled', hint: 'When a meeting you are on is cancelled' },
	{ key: 'meeting_reminder', label: 'Reminders', hint: '15 minutes before a meeting starts' },
];

// Pull persisted prefs from the server (email_notifications + the JSON map)
// the first time the settings panel opens.
const prefsHydrated = ref(false);
async function hydratePrefs() {
	if (prefsHydrated.value) return;
	prefsHydrated.value = true;
	try {
		const data = await $fetch('/api/user/notification-preferences');
		if (data?.email_notifications === false) {
			preferences.value.emailEnabled = false;
		} else if (data?.email_notifications === true) {
			preferences.value.emailEnabled = true;
		}
		if (data?.notification_preferences && typeof data.notification_preferences === 'object') {
			preferences.value.categoryPrefs = { ...data.notification_preferences };
		}
	} catch (err) {
		console.warn('[NotificationsMenu] could not hydrate prefs:', err);
	}
}
watch(showSettings, (open) => { if (open) hydratePrefs(); });
const notificationsContainer = ref(null);
const loadMoreTrigger = ref(null);

// Status filter options
const statusOptions = [
	{ label: 'Unread', value: 'inbox' },
	{ label: 'Read', value: 'archived' },
];

// Type filter options. The "type" axis is the user-visible category from
// the bell row's `metadata.category` (falling back to a heuristic for
// legacy rows that predate the category stamp).
const typeFilters = [
	{ label: 'All', value: 'all' },
	{ label: 'Conversations', value: 'conversations' },
	{ label: 'Reactions', value: 'reactions' },
	{ label: 'Tickets', value: 'tickets' },
	{ label: 'Projects', value: 'projects' },
	{ label: 'Invoices', value: 'invoices' },
	{ label: 'Contracts', value: 'contracts' },
	{ label: 'Proposals', value: 'proposals' },
	{ label: 'Meetings', value: 'meetings' },
];

// Resolve the category for a notification. Derived from subject + collection
// heuristically — the Directus directus_notifications system collection has
// no metadata column, so we don't try to read one.
function getNotificationType(notification) {
	const subject = (notification.subject || '').toLowerCase();
	if (subject.includes('react')) return 'reactions';
	if (subject.includes('mention')) return 'conversations';
	if (subject.startsWith('new comment') || subject.includes('comment on')) return 'conversations';

	const collectionMap = {
		comments: 'conversations',
		messages: 'conversations',
		tickets: 'tickets',
		projects: 'projects',
		project_tasks: 'projects',
		project_events: 'projects',
		invoices: 'invoices',
		contracts: 'contracts',
		proposals: 'proposals',
		video_meetings: 'meetings',
		appointments: 'meetings',
	};
	return collectionMap[notification.collection] || 'system';
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
	savingPrefs.value = true;
	try {
		// Local-only flags (sound, desktop) still go through the composable's
		// localStorage path. Email + per-type prefs hit the server.
		await saveUserPreferences({
			soundEnabled: preferences.value.soundEnabled,
			emailEnabled: preferences.value.emailEnabled,
			desktopEnabled: preferences.value.desktopEnabled,
		});
		await $fetch('/api/user/notification-preferences', {
			method: 'PATCH',
			body: {
				email_notifications: preferences.value.emailEnabled,
				notification_preferences: preferences.value.categoryPrefs || {},
			},
		});
		toast.success('Notification settings saved');
		showSettings.value = false;
	} catch (err) {
		console.error('[NotificationsMenu] save failed:', err);
		toast.error(err?.data?.message || err?.message || 'Could not save settings');
	} finally {
		savingPrefs.value = false;
	}
};

watch(
	() => notifications.value,
	(newVal) => {
		isLoading.value = !newVal;
	},
	{ immediate: true },
);
</script>
