<script setup>
const props = defineProps({
	message: {
		type: Object,
		required: true,
	},
	isReply: {
		type: Boolean,
		default: false,
	},
});

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const messageItems = useDirectusItems('messages');
const { user } = useDirectusAuth();
const { selectedOrg } = useOrganization();
const { isOrgAdminOrAbove } = useOrgRole();
const config = useRuntimeConfig();
const showReplyInput = ref(false);
const replyText = ref('');
const showReplies = ref(false);
const confirmingDelete = ref(false);
const isEditing = ref(false);
const editText = ref('');
const showReportDialog = ref(false);
const reportReason = ref('');
const reportDetails = ref('');
const reportLoading = ref(false);

// Get message replies using realtime subscription
const {
	data: replies,
	isLoading: repliesLoading,
} = useRealtimeSubscription(
	'messages',
	[
		'id',
		'status',
		'text',
		'date_created',
		'user_created.id',
		'user_created.first_name',
		'user_created.last_name',
		'user_created.avatar',
	],
	{
		parent_id: { _eq: props.message.id },
		status: { _eq: 'published' },
	},
	'-date_created',
);

const replyCount = computed(() => replies.value?.length || 0);
const isOwnMessage = computed(() => props.message.user_created?.id === user.value?.id);
const msgRef = ref(null);

// Click outside to cancel edit/reply
onMounted(() => {
	if (!import.meta.client) return;
	const handler = (e) => {
		if (!msgRef.value) return;
		if (!msgRef.value.contains(e.target)) {
			if (isEditing.value) cancelEdit();
			if (showReplyInput.value) { showReplyInput.value = false; replyText.value = ''; }
			confirmingDelete.value = false;
		}
	};
	document.addEventListener('mousedown', handler);
	onUnmounted(() => document.removeEventListener('mousedown', handler));
});

const avatarUrl = computed(() => {
	const avatar = props.message.user_created?.avatar;
	if (!avatar) return null;
	return `${config.public.assetsUrl}${avatar}?key=avatar`;
});

const initials = computed(() => {
	const first = props.message.user_created?.first_name?.[0] || '';
	const last = props.message.user_created?.last_name?.[0] || '';
	return (first + last).toUpperCase() || '?';
});

const toggleReplyInput = () => {
	showReplyInput.value = !showReplyInput.value;
	if (showReplyInput.value) showReplies.value = true;
};

const toggleReplies = () => {
	showReplies.value = !showReplies.value;
};

const sendReply = async () => {
	if (!replyText.value?.trim()) return;
	try {
		await messageItems.create({
			text: replyText.value,
			channel: props.message.channel,
			parent_id: props.message.id,
			status: 'published',
			user_created: user.value.id,
		});
		replyText.value = '';
		showReplyInput.value = false;
		showReplies.value = true;
	} catch (error) {
		console.error('Error sending reply:', error);
	}
};

const startEdit = () => {
	editText.value = props.message.text || '';
	isEditing.value = true;
};

const saveEdit = async () => {
	if (!editText.value?.trim()) return;
	try {
		await messageItems.update(props.message.id, { text: editText.value });
		isEditing.value = false;
	} catch (error) {
		console.error('Error editing message:', error);
	}
};

const cancelEdit = () => {
	isEditing.value = false;
	editText.value = '';
};

const deleteMessage = async () => {
	try {
		if (isOrgAdminOrAbove.value) {
			// Admin: hard delete the message and orphan replies
			await messageItems.remove(props.message.id);
		} else {
			// Non-admin: soft delete — archive so it's hidden but preserved
			await messageItems.update(props.message.id, {
				status: 'archived',
				text: '<p><em>This message was deleted.</em></p>',
			});
		}
		confirmingDelete.value = false;
		const { toast } = await import('vue-sonner');
		toast.success('Message deleted');
	} catch (error) {
		console.error('Error deleting message:', error);
		const { toast } = await import('vue-sonner');
		toast.error('Failed to delete message');
	}
};

// Extract URLs from message HTML for link previews
const messageUrls = computed(() => {
	const text = props.message.text || '';
	const urlRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
	const urls = [];
	let match;
	while ((match = urlRegex.exec(text)) !== null) {
		// Skip internal links and asset URLs
		const url = match[1];
		if (!url.includes('earnest.guru') && !url.includes('127.0.0.1') && !url.includes('localhost')) {
			urls.push(url);
		}
	}
	return [...new Set(urls)].slice(0, 3); // Max 3 previews
});

const reportReasons = [
	{ value: 'spam', label: 'Spam' },
	{ value: 'inappropriate', label: 'Inappropriate content' },
	{ value: 'harassment', label: 'Harassment' },
	{ value: 'off_topic', label: 'Off topic' },
	{ value: 'other', label: 'Other' },
];

const submitReport = async () => {
	if (!reportReason.value) return;
	reportLoading.value = true;
	try {
		const { notify } = useNotifications();
		// Notify org admins about the reported message
		await notify({
			subject: `Message reported: ${reportReason.value}`,
			message: `A message by ${props.message.user_created?.first_name} ${props.message.user_created?.last_name} was reported. Reason: ${reportReason.value}. ${reportDetails.value || ''}`.trim(),
			collection: 'messages',
			item: props.message.id,
			sender: user.value.id,
		});
		const { toast } = await import('vue-sonner');
		toast.success('Report submitted. An admin will review it.');
		showReportDialog.value = false;
		reportReason.value = '';
		reportDetails.value = '';
	} catch (error) {
		console.error('Error reporting message:', error);
		const { toast } = await import('vue-sonner');
		toast.error('Failed to submit report');
	} finally {
		reportLoading.value = false;
	}
};

const hideMessage = async () => {
	try {
		await messageItems.update(props.message.id, { status: 'archived' });
		const { toast } = await import('vue-sonner');
		toast.success('Message hidden');
	} catch (error) {
		console.error('Error hiding message:', error);
		const { toast } = await import('vue-sonner');
		toast.error('Failed to hide message');
	}
};

const handleKeyboard = (event) => {
	if (event.key === 'Enter' && (event.ctrlKey || event.metaKey || event.shiftKey)) {
		event.preventDefault();
		sendReply();
	}
};
</script>

<template>
	<div ref="msgRef" class="msg" :class="{ 'msg-reply': isReply }">
		<div class="msg-inner">
			<!-- Avatar -->
			<div class="msg-avatar">
				<img v-if="avatarUrl" :src="avatarUrl" :alt="message.user_created?.first_name" class="msg-avatar-img" />
				<span v-else class="msg-avatar-initials">{{ initials }}</span>
			</div>

			<div class="msg-body">
				<!-- Meta: name + time -->
				<div class="msg-meta">
					<span class="msg-author">
						{{ message.user_created?.first_name }} {{ message.user_created?.last_name }}
					</span>
					<span class="msg-time">
						{{ getRelativeTime(message.date_created) }}
					</span>
				</div>

				<!-- Message bubble -->
				<div class="msg-bubble">
					<!-- Three-dot menu -->
					<div class="msg-menu-wrap">
						<DropdownMenu>
							<DropdownMenuTrigger as-child>
								<button class="msg-menu-btn">
									<Icon name="lucide:more-horizontal" class="w-4 h-4" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" class="w-36">
								<DropdownMenuItem v-if="isOwnMessage" class="text-xs cursor-pointer" @click="startEdit">
									<Icon name="lucide:pencil" class="w-3.5 h-3.5 mr-2" /> Edit
								</DropdownMenuItem>
								<DropdownMenuItem v-if="isOwnMessage" class="text-xs cursor-pointer text-destructive" @click="confirmingDelete = true">
									<Icon name="lucide:trash-2" class="w-3.5 h-3.5 mr-2" /> {{ isOrgAdminOrAbove ? 'Delete permanently' : 'Delete' }}
								</DropdownMenuItem>
								<DropdownMenuItem v-if="isOrgAdminOrAbove" class="text-xs cursor-pointer" @click="hideMessage">
									<Icon name="lucide:eye-off" class="w-3.5 h-3.5 mr-2" /> Hide
								</DropdownMenuItem>
								<DropdownMenuSeparator v-if="isOwnMessage || isOrgAdminOrAbove" />
								<DropdownMenuItem v-if="!isOwnMessage" class="text-xs cursor-pointer" @click="showReportDialog = true">
									<Icon name="lucide:flag" class="w-3.5 h-3.5 mr-2" /> Report
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					<!-- Delete confirmation -->
					<div v-if="confirmingDelete" class="msg-confirm-bar">
						<div>
							<span class="text-[10px] text-destructive font-medium">Delete this message?</span>
							<span v-if="replyCount > 0" class="text-[10px] text-muted-foreground ml-1">({{ replyCount }} {{ replyCount === 1 ? 'reply' : 'replies' }} will be kept)</span>
						</div>
						<div class="flex gap-1">
							<button class="msg-confirm-btn msg-confirm-btn-danger" @click="deleteMessage">Delete</button>
							<button class="msg-confirm-btn" @click="confirmingDelete = false">Cancel</button>
						</div>
					</div>

					<!-- Edit mode -->
					<div v-else-if="isEditing" class="rounded-2xl border border-border/60 bg-muted/20 px-2 py-1">
						<LazyFormTiptap v-model="editText" :show-toolbar="true" :allow-uploads="true" :show-char-count="false" :character-limit="0" height="min-h-[36px]" custom-classes="px-2 py-1.5" :organization-id="selectedOrg" :context="{ collection: 'messages', itemId: message.id }" class="msg-tiptap-inline">
							<template #footer>
								<div class="msg-reply-footer">
									<span class="text-[10px] text-muted-foreground">Editing message</span>
									<div class="flex gap-2">
										<button class="msg-action-btn" @click="cancelEdit">Cancel</button>
										<button class="msg-send-btn" :disabled="!editText?.trim()" @click="saveEdit">Save</button>
									</div>
								</div>
							</template>
						</LazyFormTiptap>
					</div>

					<!-- Normal message content -->
					<div v-else>
						<div class="prose prose-sm dark:prose-invert max-w-none msg-text" v-html="message.text" />
						<!-- Link previews -->
						<ChannelsLinkPreview v-for="url in messageUrls" :key="url" :url="url" />
					</div>
				</div>

				<!-- Actions row -->
				<div class="msg-actions">
					<ReactionsBar :item-id="message.id" collection="messages" />
					<div class="msg-actions-right">
						<button
							v-if="!isReply && replyCount > 0"
							class="msg-action-btn"
							:class="{ 'msg-action-btn-active': showReplies }"
							@click="toggleReplies"
						>
							{{ replyCount }} {{ replyCount === 1 ? 'reply' : 'replies' }}
						</button>
						<button class="msg-action-btn" @click="toggleReplyInput">Reply</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Reply Input -->
		<div v-if="showReplyInput" class="msg-reply-input">
			<div class="rounded-2xl border border-border/60 bg-muted/20 px-2 py-1">
				<LazyFormTiptap
					v-model="replyText"
					:show-toolbar="true"
					:allow-uploads="true"
					:show-char-count="false"
					:character-limit="0"
					height="min-h-[36px]"
					custom-classes="px-2 py-1.5"
					:organization-id="selectedOrg"
					:context="{ collection: 'messages', itemId: message.id }"
					class="msg-tiptap-inline"
					@keydown="handleKeyboard"
				>
					<template #footer>
						<div class="msg-reply-footer">
							<span class="text-[10px] text-muted-foreground">Shift + Enter to send</span>
							<div class="flex gap-2">
								<button class="msg-action-btn" @click="showReplyInput = false">Cancel</button>
								<button class="msg-send-btn" :disabled="!replyText?.trim()" @click="sendReply">Reply</button>
							</div>
						</div>
					</template>
				</LazyFormTiptap>
			</div>
		</div>

		<!-- Threaded Replies -->
		<Transition name="fade">
			<div v-if="showReplies && replyCount > 0" class="msg-replies">
				<div v-if="repliesLoading" class="pl-10 space-y-2">
					<div v-for="n in 2" :key="n" class="h-12 bg-muted/30 rounded-lg animate-pulse" />
				</div>
				<template v-else>
					<ChannelsMessage v-for="reply in replies" :key="reply.id" :message="reply" :is-reply="true" />
				</template>
			</div>
		</Transition>

		<!-- Report Dialog -->
		<UModal v-model="showReportDialog">
			<template #header>
				<div class="flex items-center gap-2">
					<Icon name="lucide:flag" class="w-4 h-4 text-destructive" />
					<span class="font-semibold text-sm">Report Message</span>
				</div>
			</template>
			<div class="p-4 space-y-4">
				<div>
					<label class="block text-xs font-medium text-foreground mb-1.5">Reason</label>
					<select v-model="reportReason" class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
						<option value="" disabled>Select a reason</option>
						<option v-for="r in reportReasons" :key="r.value" :value="r.value">{{ r.label }}</option>
					</select>
				</div>
				<div>
					<label class="block text-xs font-medium text-foreground mb-1.5">
						Details <span class="text-muted-foreground">(optional)</span>
					</label>
					<textarea v-model="reportDetails" rows="3" placeholder="Add more context..." class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none" />
				</div>
			</div>
			<template #footer>
				<div class="flex justify-end gap-2">
					<button class="msg-action-btn" @click="showReportDialog = false">Cancel</button>
					<button class="msg-send-btn" style="background: hsl(var(--destructive))" :disabled="!reportReason || reportLoading" @click="submitReport">
						{{ reportLoading ? 'Submitting...' : 'Report' }}
					</button>
				</div>
			</template>
		</UModal>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.msg {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.msg-reply {
	padding-left: 40px;
	border-left: 2px solid hsl(var(--border) / 0.4);
	margin-left: 16px;
}

.msg-inner {
	display: flex;
	gap: 10px;
}

/* ── Avatar ── */
.msg-avatar {
	width: 32px;
	height: 32px;
	border-radius: 50%;
	overflow: hidden;
	flex-shrink: 0;
	background: hsl(var(--muted) / 0.5);
	display: flex;
	align-items: center;
	justify-content: center;
}

.msg-avatar-img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.msg-avatar-initials {
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 0.05em;
	color: hsl(var(--muted-foreground));
	text-transform: uppercase;
}

/* ── Body ── */
.msg-body {
	flex: 1;
	min-width: 0;
	max-width: 720px;
}

/* ── Meta ── */
.msg-meta {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-left: 8px;
	margin-bottom: 2px;
}

.msg-author {
	font-size: 9px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	color: hsl(var(--foreground));
}

.msg-time {
	font-size: 9px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: hsl(var(--muted-foreground));
}

/* ── Bubble ── */
.msg-bubble {
	position: relative;
	background: hsl(var(--muted) / 0.25);
	border-radius: 10px;
	padding: 10px 14px;
}

.msg-text :deep(p) { margin: 0; }
.msg-text :deep(ul) { margin: 0.4em 0; }
.msg-text :deep(.mention) {
	background: hsl(var(--primary) / 0.1);
	color: hsl(var(--primary));
	border-radius: 4px;
	padding: 1px 6px;
	font-weight: 600;
	font-size: 0.85em;
}

.msg-text {
	font-size: 14px;
	line-height: 1.6;
}

/* ── Three-dot menu ── */
.msg-menu-wrap {
	position: absolute;
	top: 6px;
	right: 6px;
	opacity: 0;
	transition: opacity 0.15s;
}

.msg-bubble:hover .msg-menu-wrap {
	opacity: 1;
}

.msg-menu-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border-radius: 6px;
	color: hsl(var(--muted-foreground));
	transition: all 0.15s;
}

.msg-menu-btn:hover {
	background: hsl(var(--muted) / 0.5);
	color: hsl(var(--foreground));
}

/* ── Confirm bar ── */
.msg-confirm-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 6px 0;
}

.msg-confirm-btn {
	font-size: 10px;
	font-weight: 600;
	padding: 3px 10px;
	border-radius: 6px;
	color: hsl(var(--muted-foreground));
	transition: all 0.15s;
}

.msg-confirm-btn:hover {
	background: hsl(var(--muted) / 0.4);
}

.msg-confirm-btn-danger {
	color: white;
	background: hsl(var(--destructive));
}

.msg-confirm-btn-danger:hover {
	background: hsl(var(--destructive) / 0.9);
}

/* ── Actions ── */
.msg-actions {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-top: 4px;
	padding: 0 4px;
}

.msg-actions-right {
	display: flex;
	align-items: center;
	gap: 2px;
}

.msg-action-btn {
	font-size: 10px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: hsl(var(--muted-foreground));
	padding: 2px 8px;
	border-radius: 6px;
	transition: all 0.15s;
}

.msg-action-btn:hover {
	background: hsl(var(--muted) / 0.4);
	color: hsl(var(--foreground));
}

.msg-action-btn-active {
	color: hsl(var(--primary));
}

.msg-action-btn-danger {
	color: hsl(var(--muted-foreground) / 0.5);
}

.msg-action-btn-danger:hover {
	color: hsl(var(--destructive));
	background: hsl(var(--destructive) / 0.1);
}

/* ── Reply input ── */
.msg-reply-input {
	padding-left: 42px;
	max-width: 762px; /* 720px body + 42px indent */
}

/* Strip tiptap chrome for inline inputs — mirrors .channel-tiptap from channel page */
.msg-tiptap-inline :deep(.tiptap-wrapper) {
	border: none !important;
}
.msg-tiptap-inline :deep(.tiptap-container) {
	border: none !important;
	border-radius: 0 !important;
	background: transparent !important;
	max-height: 160px;
}
.msg-tiptap-inline :deep(.toolbar) {
	border: none !important;
	border-top: 1px solid hsl(var(--border) / 0.2) !important;
	border-radius: 0 !important;
}
.msg-tiptap-inline :deep(.tiptap-container .ProseMirror) {
	font-size: 0.875rem;
	line-height: 1.625;
	min-height: 24px;
}
.msg-tiptap-inline :deep(.tiptap-container .ProseMirror p.is-editor-empty:first-child::before) {
	color: hsl(var(--muted-foreground));
	opacity: 0.5;
}

.msg-reply-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 2px 0;
}

/* ── Fade transition ── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.msg-send-btn {
	padding: 3px 14px;
	font-size: 11px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	border-radius: 6px;
	background: hsl(var(--primary));
	color: white;
	transition: opacity 0.15s;
}

.msg-send-btn:hover { opacity: 0.9; }
.msg-send-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Replies ── */
.msg-replies {
	padding-top: 4px;
	space-y: 2px;
}
</style>
