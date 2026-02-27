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
			<Avatar :class="compact ? 'size-7' : 'size-9'">
				<AvatarImage :src="getAvatarUrl(notification.sender)" :alt="getSenderName()" />
				<AvatarFallback class="text-xs">{{ getSenderInitials() }}</AvatarFallback>
			</Avatar>

			<!-- Content -->
			<div class="flex-grow min-w-0">
				<div class="flex justify-between items-start">
					<h4 class="font-medium" :class="compact ? 'text-xs' : 'text-sm'">{{ notification.subject }}</h4>
					<div class="flex items-center gap-2 ml-2">
						<span class="text-xs text-gray-500 whitespace-nowrap">{{ formatTimeAgo(notification.timestamp) }}</span>
						<Button
							v-if="!isArchived"
							variant="ghost"
							size="icon-sm"
							class="size-6 opacity-50 hover:opacity-100"
							@click.stop="$emit('mark-read', notification.id)"
							:disabled="loading"
						>
							<Check class="size-3" />
						</Button>
					</div>
				</div>

				<!-- Collection badge (shown only in non-compact mode) -->
				<div v-if="!compact && notification.collection" class="flex items-center gap-2 mt-1 mb-2">
					<Badge variant="secondary" class="uppercase text-[9px] gap-1">
						<component :is="getCollectionIcon()" class="size-3" />
						{{ notification.collection }}
					</Badge>
				</div>

				<!-- Message -->
				<div
					class="text-gray-600 dark:text-gray-300"
					:class="compact ? 'text-xs' : 'text-sm mt-1'"
					v-html="notification.message"
				></div>

				<!-- Footer Actions (compact mode) -->
				<div v-if="compact" class="flex items-center gap-2 mt-2 text-[9px] font-bold text-gray-400">
					<span class="uppercase font-bold">{{ formatTimeAgo(notification.timestamp) }}</span>
					<Button
						variant="ghost"
						size="sm"
						class="h-5 text-[9px] font-bold px-1"
						:disabled="loading"
						@click.stop="$emit('mark-read', notification.id)"
					>
						Mark as read
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="h-5 text-[9px] font-bold text-[var(--cyan)] px-1"
						@click.stop="$emit('navigate', notification)"
					>
						View
					</Button>
				</div>

				<!-- Full view actions -->
				<div v-if="!compact" class="mt-2 flex justify-end space-x-2">
					<Button
						v-if="!isArchived"
						variant="outline"
						size="sm"
						class="h-7 text-xs"
						:disabled="loading"
						@click.stop="$emit('mark-read', notification.id)"
					>
						Mark as Read
					</Button>
					<Button
						size="sm"
						class="h-7 text-xs bg-[var(--cyan)] hover:bg-[var(--cyan)]/90 text-white"
						:disabled="loading"
						@click.stop="$emit('navigate', notification)"
					>
						View
					</Button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Ticket, Folder, CheckCircle, MessageSquare, FileText, Bell } from 'lucide-vue-next'

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

const getSenderName = () => {
	const sender = props.notification.sender;
	if (!sender) return 'System';
	return `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || sender.email || 'Unknown';
};

const getSenderInitials = () => {
	const sender = props.notification.sender;
	if (!sender) return 'S';
	const first = sender.first_name?.[0] ?? '';
	const last = sender.last_name?.[0] ?? '';
	return (first + last).toUpperCase() || 'U';
};

const getAvatarUrl = (user) => {
	if (!user?.avatar) return null;
	return `${config.public.directusUrl}/assets/${user.avatar}?key=small`;
};

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

const iconMap = {
	tickets: Ticket,
	projects: Folder,
	tasks: CheckCircle,
	comments: MessageSquare,
	invoices: FileText,
};

const getCollectionIcon = () => {
	return iconMap[props.notification.collection] || Bell;
};
</script>

<style scoped>
.notification-item :deep(a) {
	color: var(--cyan, #0ea5e9);
	text-decoration: none;
}

.notification-item :deep(a:hover) {
	text-decoration: underline;
}

.notification-item :deep(div[v-html]) {
	max-height: 120px;
	overflow-y: auto;
}
</style>
