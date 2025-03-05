<template>
	<div
		class="notification-item"
		:class="[
			compact ? 'p-2' : 'p-3',
			isArchived ? 'bg-white dark:bg-gray-900' : 'bg-blue-50 dark:bg-blue-900/20',
			loading ? 'opacity-50 pointer-events-none' : '',
			'hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer',
		]"
		@click="$emit('navigate', notification)"
	>
		<div class="flex items-start gap-3">
			<!-- Sender Avatar -->
			<UAvatar :src="getAvatarUrl(notification.sender)" :alt="getSenderName()" :size="compact ? 'sm' : 'md'" />

			<!-- Content -->
			<div class="flex-grow min-w-0">
				<div class="flex justify-between items-start">
					<h4 class="font-medium" :class="compact ? 'text-xs' : 'text-sm'">{{ notification.subject }}</h4>
					<div class="flex items-center gap-2 ml-2">
						<span class="text-xs text-gray-500 whitespace-nowrap">{{ formatTimeAgo(notification.timestamp) }}</span>
						<UButton
							v-if="!isArchived"
							icon="i-heroicons-check"
							color="gray"
							variant="ghost"
							size="xs"
							class="opacity-50 hover:opacity-100"
							@click.stop="$emit('mark-read', notification.id)"
							:loading="loading"
						/>
					</div>
				</div>

				<!-- Collection badge (shown only in non-compact mode) -->
				<div v-if="!compact && notification.collection" class="flex items-center gap-2 mt-1 mb-2">
					<UBadge
						size="xs"
						:color="getCollectionColor(notification.collection)"
						variant="subtle"
						class="uppercase text-[9px]"
					>
						<UIcon :name="getCollectionIcon()" class="w-3 h-3 mr-1" />
						{{ notification.collection }}
					</UBadge>
				</div>

				<!-- Message -->
				<div
					class="text-gray-600 dark:text-gray-300"
					:class="compact ? 'text-xs' : 'text-sm mt-1'"
					v-html="notification.message"
				></div>

				<!-- Footer Actions (shown in different layouts for compact vs. full) -->
				<div v-if="compact" class="flex items-center gap-2 mt-2 text-[9px] font-bold text-gray-400">
					<span class="uppercase font-bold">{{ formatTimeAgo(notification.timestamp) }}</span>
					<UButton
						size="xs"
						variant="ghost"
						:loading="loading"
						:disabled="loading"
						class="text-[9px] font-bold"
						@click.stop="$emit('mark-read', notification.id)"
					>
						Mark as read
					</UButton>
					<UButton
						size="xs"
						variant="ghost"
						color="cyan"
						class="text-[9px] font-bold"
						@click.stop="$emit('navigate', notification)"
					>
						View
					</UButton>
				</div>

				<!-- Fuller view with actions at bottom (only in non-compact mode) -->
				<div v-if="!compact" class="mt-2 flex justify-end space-x-2">
					<UButton
						v-if="!isArchived"
						size="xs"
						color="gray"
						variant="soft"
						:loading="loading"
						@click.stop="$emit('mark-read', notification.id)"
					>
						Mark as Read
					</UButton>

					<UButton size="xs" color="cyan" :loading="loading" @click.stop="$emit('navigate', notification)">
						View
					</UButton>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
	notification: {
		type: Object,
		required: true,
	},
	isArchived: {
		type: Boolean,
		default: false,
	},
	loading: {
		type: Boolean,
		default: false,
	},
	compact: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['mark-read', 'navigate']);

const config = useRuntimeConfig();

// Get sender name
const getSenderName = () => {
	const sender = props.notification.sender;
	if (!sender) return 'System';
	return `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || sender.email || 'Unknown';
};

// Get avatar URL
const getAvatarUrl = (user) => {
	if (!user?.avatar) {
		// Fallback to avatar generator API
		const name = getSenderName();
		return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=eeeeee&color=00bfff`;
	}
	return `${config.public.directusUrl}/assets/${user.avatar}?key=small`;
};

// Format notification time
const formatTimeAgo = (timestamp) => {
	if (!timestamp) return '';

	const date = new Date(timestamp);
	const now = new Date();
	const diffMs = now - date;
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	if (diffSec < 60) return 'just now';
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHour < 24) return `${diffHour}h ago`;
	if (diffDay < 7) return `${diffDay}d ago`;

	return date.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
	});
};

// Get color for collection badge
const getCollectionColor = (collection) => {
	const colorMap = {
		tickets: 'blue',
		projects: 'green',
		tasks: 'orange',
		comments: 'indigo',
		invoices: 'gray',
	};

	return colorMap[collection] || 'gray';
};

// Get icon for collection
const getCollectionIcon = () => {
	const collection = props.notification.collection;

	if (!collection) return 'i-heroicons-bell-alert';

	const iconMap = {
		tickets: 'i-heroicons-ticket',
		projects: 'i-heroicons-folder',
		tasks: 'i-heroicons-check-circle',
		comments: 'i-heroicons-chat-bubble-left',
		invoices: 'i-heroicons-document-text',
	};

	return iconMap[collection] || 'i-heroicons-bell-alert';
};
</script>

<style scoped>
/* Make sure links in notification messages are styled properly */
.notification-item :deep(a) {
	color: var(--cyan, #0ea5e9);
	text-decoration: none;
}

.notification-item :deep(a:hover) {
	text-decoration: underline;
}

/* Limit message height to prevent extremely long notifications */
.notification-item :deep(div[v-html]) {
	max-height: 120px;
	overflow-y: auto;
}
</style>
