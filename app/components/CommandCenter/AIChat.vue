<script setup lang="ts">
import { nextTick } from 'vue';

const { user: sessionUser } = useUserSession();
const user = computed(() => sessionUser.value ?? null);
const config = useRuntimeConfig();
const { selectedClient, clientList: clients } = useClients();
const { selectedOrg, currentOrg: organization } = useOrganization();

// ── Brand Completeness Check ──
const brandIncomplete = computed(() => {
	// Check whichever entity is currently selected (client or org)
	if (selectedClient.value && selectedClient.value !== 'org') {
		const client = (clients.value || []).find((c: any) => c.id === selectedClient.value) as any;
		if (!client) return false;
		return !client.brand_direction || !client.goals || !client.target_audience || !client.location;
	}
	// Fall back to org
	const org = organization.value as any;
	if (!org) return false;
	return !org.brand_direction || !org.goals || !org.target_audience || !org.location;
});

const brandEntityName = computed(() => {
	if (selectedClient.value && selectedClient.value !== 'org') {
		const client = (clients.value || []).find((c: any) => c.id === selectedClient.value) as any;
		return client?.name || 'your client';
	}
	return (organization.value as any)?.name || 'your organization';
});

const brandSetupRoute = computed(() => {
	if (selectedClient.value && selectedClient.value !== 'org') {
		return `/clients/${selectedClient.value}`;
	}
	return '/organization';
});

// ── Persona (shared state) ──
const { personas: responseStyles, selectedPersona: responseStyle, activePersona } = useAIPersona();
const { responseVerbosity, setVerbosity } = useAIPreferences();
const { trackUsage } = useAIUsage();

// ── Smart Prompts (data-driven) ──
const { fetchSmartData, getSmartPrompts, smartData } = useAISmartPrompts();
const smartPrompts = computed(() => getSmartPrompts(responseStyle.value));

// ── Save Note Modal ──
const showSaveNote = ref(false);
const saveNoteMessage = ref({ content: '', id: '' });
const savedMessageIds = ref<Set<string>>(new Set());

const openSaveNote = (msg: any) => {
  saveNoteMessage.value = { content: msg.content, id: msg.id };
  showSaveNote.value = true;
};

const onNoteSaved = (note: any) => {
  savedMessageIds.value.add(saveNoteMessage.value.id);
};

const copyMessage = async (content: string) => {
  try {
    await navigator.clipboard.writeText(content);
  } catch {}
};

// ── Feedback ──
const correctionTarget = ref<any>(null);
const correctionText = ref('');

const submitFeedback = async (msg: any, rating: 'positive' | 'negative', correction?: string) => {
  try {
    await $fetch(`/api/ai/messages/${msg.id}/feedback`, {
      method: 'POST',
      body: { rating, correction },
    });
    // Optimistic update
    msg.feedback = { rating, correction };
  } catch (err: any) {
    console.warn('[AIChat] Feedback failed:', err.message);
  }
};

const openCorrection = (msg: any) => {
  if (correctionTarget.value?.id === msg.id) {
    // Toggle off
    correctionTarget.value = null;
    correctionText.value = '';
    return;
  }
  correctionTarget.value = msg;
  correctionText.value = '';
};

const submitCorrection = async () => {
  if (!correctionTarget.value) return;
  await submitFeedback(correctionTarget.value, 'negative', correctionText.value || undefined);
  correctionTarget.value = null;
  correctionText.value = '';
};

// Fetch smart data on mount for data-driven prompts
onMounted(() => { fetchSmartData(); });

// ── State ──
const sessions = ref<any[]>([]);
const activeSessionId = ref<string | null>(null);
const messages = ref<any[]>([]);
const newMessage = ref('');
const isLoadingSessions = ref(false);
const isLoadingMessages = ref(false);
const isSending = ref(false);
const isStreaming = ref(false);
const streamingContent = ref('');
const messagesContainer = ref<HTMLElement | null>(null);
const showSidebar = ref(true);
const error = ref<string | null>(null);
const abortController = ref<AbortController | null>(null);

// ── Sessions ──
const loadSessions = async () => {
	isLoadingSessions.value = true;
	try {
		const response = await $fetch('/api/ai/sessions', {
			params: { limit: 50, status: 'active' },
		});
		sessions.value = (response as any)?.sessions || [];
	} catch (e: any) {
		console.error('[AIChat] Failed to load sessions:', e);
	} finally {
		isLoadingSessions.value = false;
	}
};

const loadSession = async (sessionId: string) => {
	activeSessionId.value = sessionId;
	messages.value = [];
	streamingContent.value = '';
	isLoadingMessages.value = true;
	error.value = null;
	try {
		const response = await $fetch(`/api/ai/sessions/${sessionId}`, {
			params: { messageLimit: 100 },
		});
		messages.value = (response as any)?.messages || [];
		await nextTick();
		scrollToBottom();
	} catch (e: any) {
		console.error('[AIChat] Failed to load session:', e);
		error.value = 'Failed to load conversation';
	} finally {
		isLoadingMessages.value = false;
	}
};

const startNewSession = () => {
	activeSessionId.value = null;
	messages.value = [];
	streamingContent.value = '';
	error.value = null;
	newMessage.value = '';
};

const deleteSession = async (sessionId: string) => {
	try {
		await $fetch(`/api/ai/sessions/${sessionId}`, { method: 'DELETE' });
		sessions.value = sessions.value.filter((s) => s.id !== sessionId);
		if (activeSessionId.value === sessionId) {
			startNewSession();
		}
	} catch (e: any) {
		console.error('[AIChat] Failed to delete session:', e);
	}
};

// ── Messaging with SSE streaming ──
const sendMessage = async () => {
	const content = newMessage.value.trim();
	if (!content || isSending.value) return;

	isSending.value = true;
	isStreaming.value = true;
	streamingContent.value = '';
	error.value = null;

	// Optimistically add user message
	const userMsg = {
		id: `temp-${Date.now()}`,
		role: 'user',
		content,
		date_created: new Date().toISOString(),
	};
	messages.value.push(userMsg);
	newMessage.value = '';
	await nextTick();
	scrollToBottom();

	try {
		abortController.value = new AbortController();
		const response = await fetch('/api/ai/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal: abortController.value.signal,
			body: JSON.stringify({
				sessionId: activeSessionId.value || undefined,
				message: content,
				clientId: selectedClient.value && selectedClient.value !== 'org' ? selectedClient.value : undefined,
				organizationId: (selectedOrg.value as any)?.id || undefined,
				responseStyle: responseStyle.value !== 'default' ? responseStyle.value : undefined,
				verbosity: responseVerbosity.value,
			}),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const reader = response.body?.getReader();
		if (!reader) throw new Error('No response stream');

		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.startsWith('data: ')) continue;
				try {
					const data = JSON.parse(line.slice(6));
					if (data.type === 'chunk') {
						streamingContent.value += data.content;
						await nextTick();
						scrollToBottom();
					} else if (data.type === 'done') {
						// Set session ID from response
						if (data.sessionId && !activeSessionId.value) {
							activeSessionId.value = data.sessionId;
							await loadSessions(); // Refresh session list
						}
						// Add assistant message
						messages.value.push({
							id: `assistant-${Date.now()}`,
							role: 'assistant',
							content: data.content,
							date_created: new Date().toISOString(),
						});
						// Track AI usage
						trackUsage(content.length, (data.content || '').length, undefined, responseStyle.value);
						streamingContent.value = '';
					} else if (data.type === 'error') {
						error.value = data.error;
					}
				} catch {
					// skip malformed JSON
				}
			}
		}
	} catch (e: any) {
		console.error('[AIChat] Stream error:', e);
		error.value = e.message || 'Failed to get AI response';
		// Remove optimistic user message on error
		messages.value = messages.value.filter((m) => m.id !== userMsg.id);
	} finally {
		isSending.value = false;
		isStreaming.value = false;
		streamingContent.value = '';
		abortController.value = null;
	}
};

// ── Helpers ──
const scrollToBottom = () => {
	if (messagesContainer.value) {
		messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
	}
};

const handleKeydown = (e: KeyboardEvent) => {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
};

// formatTime and formatRelativeDay are auto-imported from utils/dates.ts
const formatDate = (dateStr: string) => formatRelativeDay(dateStr);

const sessionTitle = (session: any) => {
	return session.title || 'Untitled';
};

/**
 * Lightweight markdown → HTML renderer.
 * Handles: headers, bold, italic, code blocks, inline code, lists, links, line breaks.
 */
const renderMarkdown = (text: string): string => {
	if (!text) return '';
	let html = text;

	// Escape HTML entities first
	html = html
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');

	// Code blocks (```...```)
	html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
		return `<pre class="bg-gray-900 text-gray-100 rounded-lg p-3 my-2 overflow-x-auto text-xs leading-relaxed"><code>${code.trim()}</code></pre>`;
	});

	// Inline code (`...`)
	html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">$1</code>');

	// Headers
	html = html.replace(/^### (.+)$/gm, '<h4 class="text-sm font-semibold mt-3 mb-1">$1</h4>');
	html = html.replace(/^## (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-1">$1</h3>');
	html = html.replace(/^# (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>');

	// Bold and italic
	html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
	html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

	// Unordered lists
	html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>');
	html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="my-1 space-y-0.5">$&</ul>');

	// Ordered lists
	html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>');

	// Links (only allow http/https URLs to prevent XSS via javascript: URIs)
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m: string, text: string, url: string) => {
		if (/^https?:\/\//i.test(url)) {
			return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">${text}</a>`;
		}
		return text;
	});

	// Source attribution badges
	html = html.replace(/\[Source:\s*([^\]]+)\]/g,
		'<span class="inline-flex items-center px-1.5 py-0 rounded-full bg-primary/10 text-primary text-[9px] font-medium whitespace-nowrap align-baseline mx-0.5">$1</span>');

	// Line breaks (double newline = paragraph)
	html = html.replace(/\n\n/g, '</p><p class="my-2">');
	html = html.replace(/\n/g, '<br>');

	return `<p class="my-1">${html}</p>`;
};

const getUserAvatar = computed(() => {
	const u = user.value as any;
	if (!u) return '';
	if (u.avatar) return `${config.public.assetsUrl}${u.avatar}?key=avatar`;
	const name = `${u.first_name || 'U'}+${u.last_name || ''}`;
	return `https://ui-avatars.com/api/?name=${name}&background=6366f1&color=fff&size=32`;
});

// ── Lifecycle ──
onMounted(() => {
	loadSessions();
});

onUnmounted(() => {
	abortController.value?.abort();
});
</script>

<template>
	<div class="flex h-full bg-background rounded-xl overflow-hidden border border-border/30">
		<!-- Sidebar: Session List -->
		<div
			v-show="showSidebar"
			class="w-64 flex-shrink-0 border-r border-border/30 flex flex-col bg-muted/30"
		>
			<!-- Sidebar Header -->
			<div class="p-3 border-b border-border/30">
				<button
					@click="startNewSession"
					class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
				>
					<UIcon name="i-heroicons-plus" class="w-4 h-4" />
					New Chat
				</button>
			</div>

			<!-- Session List -->
			<div class="flex-1 overflow-y-auto">
				<div v-if="isLoadingSessions" class="flex items-center justify-center py-8">
					<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-muted-foreground" />
				</div>

				<div v-else-if="sessions.length === 0" class="text-center py-8 px-4">
					<UIcon name="i-heroicons-chat-bubble-left-right" class="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
					<p class="text-xs text-muted-foreground">No conversations yet</p>
				</div>

				<div v-else class="py-1">
					<div
						v-for="session in sessions"
						:key="session.id"
						role="button"
						tabindex="0"
						@click="loadSession(session.id)"
						@keydown.enter.prevent="loadSession(session.id)"
						@keydown.space.prevent="loadSession(session.id)"
						class="w-full text-left px-3 py-2.5 text-sm transition-colors group flex items-center justify-between cursor-pointer"
						:class="
							activeSessionId === session.id
								? 'bg-primary/10 text-foreground'
								: 'text-muted-foreground hover:bg-muted hover:text-foreground'
						"
					>
						<div class="flex-1 min-w-0">
							<p class="truncate text-sm">{{ sessionTitle(session) }}</p>
							<p class="text-[10px] text-muted-foreground/70 mt-0.5">
								{{ formatChatTimestamp(session.date_updated || session.date_created) }}
							</p>
						</div>
						<button
							@click.stop="deleteSession(session.id)"
							class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
							title="Delete conversation"
						>
							<UIcon name="i-heroicons-trash" class="w-3.5 h-3.5" />
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Main Chat Area -->
		<div class="flex-1 flex flex-col min-w-0">
			<!-- Chat Header -->
			<div class="flex items-center justify-between p-3 border-b border-border/30">
				<div class="flex items-center gap-2">
					<button
						@click="showSidebar = !showSidebar"
						class="p-1.5 rounded-lg hover:bg-muted transition-colors lg:hidden"
					>
						<UIcon name="i-heroicons-bars-3" class="w-4 h-4" />
					</button>
					<button
						@click="showSidebar = !showSidebar"
						class="p-1.5 rounded-lg hover:bg-muted transition-colors hidden lg:block"
						:title="showSidebar ? 'Hide sidebar' : 'Show sidebar'"
					>
						<UIcon
							:name="showSidebar ? 'i-heroicons-chevron-double-left' : 'i-heroicons-chevron-double-right'"
							class="w-4 h-4"
						/>
					</button>
					<UIcon :name="activePersona.icon" class="w-5 h-5 text-primary" />
					<h3 class="text-sm font-semibold">{{ activePersona.label }}</h3>
				</div>
				<!-- Compact persona switcher (visible during conversation) -->
				<div v-if="messages.length > 0" class="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5">
					<button
						v-for="style in responseStyles"
						:key="style.value"
						@click="responseStyle = style.value"
						:title="`${style.label} — ${style.description}`"
						class="flex items-center gap-1 px-2 py-1 rounded-md transition-all text-[10px] font-medium"
						:class="responseStyle === style.value
							? 'bg-background text-primary shadow-sm'
							: 'text-muted-foreground hover:text-foreground'"
					>
						<UIcon :name="style.icon" class="w-3 h-3" />
						<span class="hidden sm:inline">{{ style.label }}</span>
					</button>
				</div>

				<!-- Verbosity toggle -->
				<div class="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5">
					<button
						@click="setVerbosity('concise')"
						title="Concise responses"
						class="flex items-center gap-1 px-2 py-1 rounded-md transition-all text-[10px] font-medium"
						:class="responseVerbosity === 'concise'
							? 'bg-background text-primary shadow-sm'
							: 'text-muted-foreground hover:text-foreground'"
					>
						<UIcon name="i-heroicons-bars-3-bottom-left" class="w-3 h-3" />
						<span class="hidden sm:inline">Concise</span>
					</button>
					<button
						@click="setVerbosity('regular')"
						title="Regular responses"
						class="flex items-center gap-1 px-2 py-1 rounded-md transition-all text-[10px] font-medium"
						:class="responseVerbosity === 'regular'
							? 'bg-background text-primary shadow-sm'
							: 'text-muted-foreground hover:text-foreground'"
					>
						<UIcon name="i-heroicons-bars-3" class="w-3 h-3" />
						<span class="hidden sm:inline">Regular</span>
					</button>
				</div>

				<div v-if="isStreaming" class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<span class="flex gap-0.5">
						<span class="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style="animation-delay: 0ms"></span>
						<span class="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style="animation-delay: 150ms"></span>
						<span class="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style="animation-delay: 300ms"></span>
					</span>
					Thinking...
				</div>
			</div>

			<!-- Messages -->
			<div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
				<!-- Brand completeness prompt -->
				<NuxtLink
					v-if="brandIncomplete"
					:to="brandSetupRoute"
					class="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-xl text-sm transition-colors hover:bg-amber-100 dark:hover:bg-amber-900/20"
				>
					<UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
					<div>
						<p class="font-medium text-foreground">Complete your brand profile for {{ brandEntityName }}</p>
						<p class="text-xs text-muted-foreground mt-0.5">
							Fill in brand direction, goals, target audience, and location to get personalized AI responses from Earnest.
						</p>
					</div>
					<UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
				</NuxtLink>

				<!-- Empty state: Operational Snapshot + Persona Selection -->
				<div
					v-if="messages.length === 0 && !isLoadingMessages"
					class="flex flex-col items-center justify-center flex-1 min-h-0 px-4"
				>
					<!-- Operational Snapshot -->
					<div v-if="smartData" class="w-full max-w-lg mb-5">
						<div class="flex flex-wrap gap-2 justify-center">
							<div
								v-if="smartData.overdueInvoices.count > 0"
								class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-medium text-amber-700 dark:text-amber-400"
							>
								<UIcon name="i-heroicons-banknotes" class="w-3.5 h-3.5" />
								{{ smartData.overdueInvoices.count }} overdue — ${{ smartData.overdueInvoices.total.toLocaleString() }}
							</div>
							<div
								v-if="smartData.staleClients.length > 0"
								class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-xs font-medium text-orange-700 dark:text-orange-400"
							>
								<UIcon name="i-heroicons-user-group" class="w-3.5 h-3.5" />
								{{ smartData.staleClients.length }} client{{ smartData.staleClients.length > 1 ? 's' : '' }} need follow-up
							</div>
							<div
								v-if="smartData.overdueProjects.length > 0"
								class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-xs font-medium text-rose-700 dark:text-rose-400"
							>
								<UIcon name="i-heroicons-folder" class="w-3.5 h-3.5" />
								{{ smartData.overdueProjects.length }} project{{ smartData.overdueProjects.length > 1 ? 's' : '' }} overdue
							</div>
							<div
								v-if="smartData.overdueTasks > 0"
								class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-700 dark:text-red-400"
							>
								<UIcon name="i-heroicons-clipboard-document-check" class="w-3.5 h-3.5" />
								{{ smartData.overdueTasks }} task{{ smartData.overdueTasks > 1 ? 's' : '' }} overdue
							</div>
							<div
								v-if="smartData.openDeals.count > 0"
								class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-700 dark:text-emerald-400"
							>
								<UIcon name="i-heroicons-currency-dollar" class="w-3.5 h-3.5" />
								{{ smartData.openDeals.count }} open deal{{ smartData.openDeals.count > 1 ? 's' : '' }} — ${{ smartData.openDeals.pipelineValue.toLocaleString() }}
							</div>
						</div>
					</div>

					<!-- Greeting -->
					<div class="text-center mb-6">
						<h3 class="text-lg font-bold text-foreground mb-1">Here's what's on your radar</h3>
						<p class="text-sm text-muted-foreground">Pick a vibe to get started. You can switch anytime.</p>
					</div>

					<!-- Persona Cards -->
					<div class="grid grid-cols-2 gap-3 w-full max-w-lg mb-6">
						<button
							v-for="style in responseStyles"
							:key="style.value"
							@click="responseStyle = style.value"
							class="relative p-4 rounded-xl border text-left transition-all duration-200 hover:scale-[1.02]"
							:class="responseStyle === style.value ? style.activeClass : style.bgClass + ' hover:border-foreground/20'"
						>
							<div class="flex items-center gap-2.5 mb-2">
								<div
									class="w-9 h-9 rounded-xl flex items-center justify-center"
									:class="style.iconBg"
								>
									<UIcon :name="style.icon" class="w-5 h-5" :class="style.iconColor" />
								</div>
								<div>
									<p class="text-sm font-bold text-foreground leading-tight">{{ style.label }}</p>
								</div>
							</div>
							<p class="text-xs text-muted-foreground leading-relaxed">{{ style.description }}</p>
							<!-- Active indicator -->
							<div
								v-if="responseStyle === style.value"
								class="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-primary animate-pulse"
							/>
						</button>
					</div>

					<!-- Active persona greeting + smart prompts -->
					<div class="text-center max-w-md">
						<div class="flex items-center justify-center gap-2 mb-3">
							<div
								class="w-8 h-8 rounded-lg flex items-center justify-center"
								:class="activePersona.iconBg"
							>
								<UIcon :name="activePersona.icon" class="w-4 h-4" :class="activePersona.iconColor" />
							</div>
							<p class="text-sm font-medium text-foreground italic">"{{ activePersona.greeting }}"</p>
						</div>
						<div class="flex flex-wrap gap-2 justify-center">
							<button
								v-for="prompt in smartPrompts"
								:key="prompt"
								@click="newMessage = prompt"
								class="px-3 py-1.5 rounded-full text-xs transition-all hover:scale-105"
								:class="activePersona.bgClass + ' text-foreground hover:shadow-sm'"
							>
								{{ prompt }}
							</button>
						</div>
					</div>
				</div>

				<!-- Loading -->
				<div v-if="isLoadingMessages" class="flex items-center justify-center h-full">
					<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-muted-foreground" />
				</div>

				<!-- Messages List -->
				<template v-if="messages.length > 0">
					<div
						v-for="msg in messages"
						:key="msg.id"
						class="flex gap-3 group"
						:class="msg.role === 'user' ? 'flex-row-reverse' : ''"
					>
						<!-- Avatar -->
						<div class="flex-shrink-0 mt-0.5">
							<img
								v-if="msg.role === 'user'"
								:src="getUserAvatar"
								alt="You"
								class="w-7 h-7 rounded-full"
							/>
							<div
								v-else
								class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center"
							>
								<UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-primary" />
							</div>
						</div>

						<!-- Message Content -->
						<div class="max-w-[80%] relative">
							<div
								class="rounded-xl px-4 py-2.5"
								:class="
									msg.role === 'user'
										? 'bg-primary text-primary-foreground'
										: 'bg-muted'
								"
							>
								<!-- User messages: plain text -->
								<p v-if="msg.role === 'user'" class="text-sm whitespace-pre-wrap break-words">
									{{ msg.content }}
								</p>
								<!-- Assistant messages: rendered markdown -->
								<div
									v-else
									class="text-sm prose prose-sm dark:prose-invert max-w-none break-words [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1"
									v-html="renderMarkdown(msg.content)"
								></div>
								<p
									class="text-[10px] mt-1"
									:class="msg.role === 'user' ? 'text-primary-foreground/60 text-right' : 'text-muted-foreground'"
								>
									{{ formatTime(msg.date_created) }}
								</p>
							</div>

							<!-- Hover actions (assistant messages only) -->
							<div
								v-if="msg.role === 'assistant'"
								class="absolute -bottom-3 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
							>
								<button
									@click="openSaveNote(msg)"
									class="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-background border border-border shadow-sm hover:bg-muted transition-colors"
									:class="savedMessageIds.has(msg.id) ? 'text-primary' : 'text-muted-foreground'"
									:title="savedMessageIds.has(msg.id) ? 'Saved' : 'Save as Note'"
								>
									<UIcon
										:name="savedMessageIds.has(msg.id) ? 'i-heroicons-bookmark-solid' : 'i-heroicons-bookmark'"
										class="w-3 h-3"
									/>
									{{ savedMessageIds.has(msg.id) ? 'Saved' : 'Save' }}
								</button>
								<button
									@click="copyMessage(msg.content)"
									class="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium text-muted-foreground bg-background border border-border shadow-sm hover:bg-muted transition-colors"
									title="Copy to clipboard"
								>
									<UIcon name="i-heroicons-clipboard-document" class="w-3 h-3" />
									Copy
								</button>
								<button
									@click="submitFeedback(msg, 'positive')"
									class="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-background border border-border shadow-sm hover:bg-muted transition-colors"
									:class="msg.feedback?.rating === 'positive' ? 'text-green-500' : 'text-muted-foreground'"
									title="Helpful"
								>
									<UIcon name="i-heroicons-hand-thumb-up" class="w-3 h-3" />
								</button>
								<button
									@click="openCorrection(msg)"
									class="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-background border border-border shadow-sm hover:bg-muted transition-colors"
									:class="msg.feedback?.rating === 'negative' ? 'text-red-500' : 'text-muted-foreground'"
									title="Not helpful"
								>
									<UIcon name="i-heroicons-hand-thumb-down" class="w-3 h-3" />
								</button>
							</div>
							<!-- Correction input (appears below message on thumbs-down) -->
							<div
								v-if="correctionTarget?.id === msg.id"
								class="mt-1 ml-2 flex gap-1.5 items-end"
							>
								<textarea
									v-model="correctionText"
									placeholder="What was wrong? (optional)"
									class="flex-1 text-xs rounded-lg border border-border bg-background px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
									rows="2"
									@keydown.enter.ctrl="submitCorrection"
								/>
								<button
									@click="submitCorrection"
									class="px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors shrink-0"
								>
									Submit
								</button>
							</div>
						</div>
					</div>

					<!-- Streaming response -->
					<div v-if="streamingContent" class="flex gap-3">
						<div class="flex-shrink-0 mt-0.5">
							<div class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
								<UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-primary animate-pulse" />
							</div>
						</div>
						<div class="max-w-[80%] rounded-xl px-4 py-2.5 bg-muted">
							<div
								class="text-sm prose prose-sm dark:prose-invert max-w-none break-words [&>p]:my-1"
								v-html="renderMarkdown(streamingContent)"
							></div>
							<span class="inline-block w-2 h-4 bg-primary/60 animate-pulse ml-0.5 rounded-sm"></span>
						</div>
					</div>
				</template>

				<!-- Error -->
				<div v-if="error" class="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
					<UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 flex-shrink-0" />
					<p>{{ error }}</p>
					<button @click="error = null" class="ml-auto">
						<UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
					</button>
				</div>
			</div>

			<!-- Input -->
			<div class="border-t border-border/30 p-3">
				<div class="flex items-end gap-2">
					<textarea
						v-model="newMessage"
						@keydown="handleKeydown"
						:disabled="isSending"
						placeholder="Ask about a client, project, or invoice..."
						rows="1"
						class="flex-1 resize-none text-sm border border-border rounded-lg px-3 py-2.5 bg-transparent text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
					/>
					<button
						@click="sendMessage"
						:disabled="!newMessage.trim() || isSending"
						class="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
					>
						<UIcon
							v-if="isSending"
							name="i-heroicons-arrow-path"
							class="w-4 h-4 animate-spin"
						/>
						<UIcon v-else name="i-heroicons-paper-airplane" class="w-4 h-4" />
					</button>
				</div>
				<p class="text-[10px] text-muted-foreground mt-1.5 text-center">
					AI may make mistakes. Verify important information.
				</p>
			</div>
		</div>
	</div>

	<!-- Save Note Modal -->
	<AISaveNoteModal
		v-model="showSaveNote"
		:message-content="saveNoteMessage.content"
		:session-id="activeSessionId || ''"
		:message-id="saveNoteMessage.id"
		@saved="onNoteSaved"
	/>
</template>
