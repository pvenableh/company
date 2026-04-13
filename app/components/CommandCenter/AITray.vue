<script setup lang="ts">
import { nextTick } from 'vue';

const props = defineProps<{
	isOpen: boolean;
	initialPrompt?: string;
}>();

const emit = defineEmits<{
	(e: 'close'): void;
}>();

const { suggestions, metrics, isAnalyzing, greeting, analyze } = useAIProductivityEngine();
const { enabledModules } = useAIPreferences();
const { personas, selectedPersona, activePersona } = useAIPersona();
const {
	quickMessages,
	isQuickSending,
	isQuickStreaming,
	quickStreamingContent,
	quickError,
	sendQuickMessage,
	clearQuickChat,
} = useEarnestChat();
const router = useRouter();

const { fetchSmartData, getSmartPrompts, smartData } = useAISmartPrompts();
const activeTab = ref<'chat' | 'productivity' | 'notes'>('chat');
const smartPrompts = computed(() => getSmartPrompts(selectedPersona.value));

// Save Note from tray
const showTraySaveNote = ref(false);
const traySaveMsg = ref({ content: '', id: '' });
const traySavedIds = ref<Set<string>>(new Set());

const openTraySaveNote = (msg: any) => {
  traySaveMsg.value = { content: msg.content, id: msg.id };
  showTraySaveNote.value = true;
};

const onTrayNoteSaved = () => {
  traySavedIds.value.add(traySaveMsg.value.id);
};

// Notes tab state
const { notes: allNotes, fetchNotes, isLoading: trayNotesLoading } = useAINotes();
const trayNotesSearch = ref('');
const trayNotes = computed(() => {
  const q = trayNotesSearch.value.toLowerCase().trim();
  let result = allNotes.value;
  if (q) {
    result = result.filter(n => n.title?.toLowerCase().includes(q) || n.excerpt?.toLowerCase().includes(q));
  }
  return result.slice(0, 20);
});

const loadTrayNotes = () => { fetchNotes({ limit: 20 }); };
const getTrayNoteTags = (note: any) => (note.tags || []).map((jn: any) => jn.ai_tags_id).filter(Boolean);

const showTrayNoteDetail = ref(false);
const trayNoteDetailId = ref('');
const openTrayNote = (noteId: string) => {
  trayNoteDetailId.value = noteId;
  showTrayNoteDetail.value = true;
};
const filterCategory = ref('all');
const showPreferences = ref(false);
const chatInput = ref('');
const chatContainer = ref<HTMLElement | null>(null);

const categories = [
	{ value: 'all', label: 'All', icon: 'i-heroicons-squares-2x2' },
	{ value: 'tasks', label: 'Tasks', icon: 'i-heroicons-clipboard-document-check' },
	{ value: 'projects', label: 'Projects', icon: 'i-heroicons-square-3-stack-3d' },
	{ value: 'invoices', label: 'Invoices', icon: 'i-heroicons-document-text' },
	{ value: 'communication', label: 'Chat', icon: 'i-heroicons-chat-bubble-left-right' },
	{ value: 'social', label: 'Social', icon: 'i-heroicons-share' },
	{ value: 'scheduling', label: 'Schedule', icon: 'i-heroicons-calendar-date-range' },
	{ value: 'phone', label: 'Phone', icon: 'i-heroicons-phone' },
	{ value: 'leads', label: 'Leads', icon: 'i-heroicons-user-plus' },
];

const filteredSuggestions = computed(() => {
	if (filterCategory.value === 'all') return suggestions.value;
	return suggestions.value.filter((s) => s.category === filterCategory.value);
});

const quickActions = [
	{ label: 'Chat History', icon: 'i-heroicons-clock', route: '/command-center/ai' },
	{ label: 'New Task', icon: 'i-heroicons-plus-circle', route: '/tickets' },
	{ label: 'Send Invoice', icon: 'i-heroicons-paper-airplane', route: '/invoices' },
	{ label: 'Schedule Call', icon: 'i-heroicons-phone', route: '/scheduler' },
	{ label: 'Post Update', icon: 'i-heroicons-megaphone', route: '/social/compose' },
	{ label: 'View Projects', icon: 'i-heroicons-square-3-stack-3d', route: '/projects' },
];

const handleQuickAction = (route: string) => {
	router.push(route);
	emit('close');
};

const handleSuggestionClick = (suggestion: any) => {
	if (suggestion.actionRoute) {
		router.push(suggestion.actionRoute);
		emit('close');
	}
};

const handleChatSubmit = async () => {
	const content = chatInput.value.trim();
	if (!content) return;
	chatInput.value = '';
	await sendQuickMessage(content);
	await nextTick();
	scrollChatToBottom();
};

const handleChatKeydown = (e: KeyboardEvent) => {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		handleChatSubmit();
	}
};

const scrollChatToBottom = () => {
	if (chatContainer.value) {
		chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
	}
};

const openFullChat = () => {
	router.push('/command-center/ai');
	emit('close');
};

const runAnalysis = () => {
	analyze(new Set(enabledModules.value));
};

// Simple markdown rendering
const renderMarkdown = (text: string): string => {
	if (!text) return '';
	let html = text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
	html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
		`<pre class="bg-gray-900 text-gray-100 rounded-lg p-2 my-1 overflow-x-auto text-[11px] leading-relaxed"><code>${code.trim()}</code></pre>`
	);
	html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-[11px] font-mono">$1</code>');
	html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
	html = html.replace(/^- (.+)$/gm, '<li class="ml-3 list-disc text-xs">$1</li>');
	html = html.replace(/\n\n/g, '</p><p class="my-1">');
	html = html.replace(/\n/g, '<br>');
	return `<p class="my-0.5">${html}</p>`;
};

onMounted(() => {
	runAnalysis();
	fetchSmartData();
});

// Re-analyze when tray opens; handle initial prompt
watch(
	() => props.isOpen,
	async (open) => {
		if (open) {
			showPreferences.value = false;
			runAnalysis();
			// If there's an initial prompt, switch to chat tab and send it
			if (props.initialPrompt) {
				activeTab.value = 'chat';
				await nextTick();
				await sendQuickMessage(props.initialPrompt);
				await nextTick();
				scrollChatToBottom();
			}
		}
	},
);

// Auto-scroll when streaming
watch(quickStreamingContent, () => {
	nextTick(() => scrollChatToBottom());
});
</script>

<template>
	<Transition name="tray">
		<div
			v-if="isOpen"
			class="fixed right-0 top-0 h-full w-full max-w-sm bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col overflow-hidden border-l border-gray-200 dark:border-gray-700"
		>
			<!-- Header -->
			<div class="border-b border-gray-100 dark:border-gray-700">
				<div class="flex items-center justify-between p-4 bg-gradient-to-r from-primary/5 to-violet-500/5">
					<div class="flex items-center gap-2">
						<div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="activePersona.iconBg">
							<UIcon :name="activePersona.icon" class="w-4 h-4" :class="activePersona.iconColor" />
						</div>
						<div>
							<h2 class="text-sm font-bold text-gray-900 dark:text-white">Earnest AI</h2>
							<p class="text-[10px] text-gray-500 italic">"{{ activePersona.greeting }}"</p>
						</div>
					</div>
					<div class="flex items-center gap-1">
						<button
							@click="showPreferences = !showPreferences"
							class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
							:class="showPreferences ? 'bg-primary/10 text-primary' : ''"
						>
							<UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4" :class="showPreferences ? 'text-primary' : 'text-gray-500'" />
						</button>
						<button
							@click="emit('close')"
							class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
						>
							<UIcon name="i-heroicons-x-mark" class="w-5 h-5 text-gray-500" />
						</button>
					</div>
				</div>
				<!-- Persona Picker -->
				<div class="flex gap-1 px-4 py-2 bg-muted/20">
					<button
						v-for="p in personas"
						:key="p.value"
						@click="selectedPersona = p.value"
						class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all flex-1 justify-center"
						:class="selectedPersona === p.value
							? p.bgClass + ' border ' + (p.iconColor)
							: 'text-muted-foreground hover:bg-muted/50'"
					>
						<UIcon :name="p.icon" class="w-3 h-3" :class="selectedPersona === p.value ? p.iconColor : ''" />
						<span class="hidden sm:inline">{{ p.label.replace('The ', '') }}</span>
					</button>
				</div>
				<!-- Tab Switcher -->
				<div v-if="!showPreferences" class="flex border-b border-gray-100 dark:border-gray-700">
					<button
						@click="activeTab = 'chat'"
						class="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors"
						:class="activeTab === 'chat'
							? 'text-primary border-b-2 border-primary'
							: 'text-muted-foreground hover:text-foreground'"
					>
						<UIcon name="i-heroicons-chat-bubble-left-right" class="w-3.5 h-3.5" />
						Chat
					</button>
					<button
						@click="activeTab = 'productivity'"
						class="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors"
						:class="activeTab === 'productivity'
							? 'text-primary border-b-2 border-primary'
							: 'text-muted-foreground hover:text-foreground'"
					>
						<UIcon name="i-heroicons-bolt" class="w-3.5 h-3.5" />
						Productivity
					</button>
					<button
						@click="activeTab = 'notes'; loadTrayNotes()"
						class="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors"
						:class="activeTab === 'notes'
							? 'text-primary border-b-2 border-primary'
							: 'text-muted-foreground hover:text-foreground'"
					>
						<UIcon name="i-heroicons-bookmark" class="w-3.5 h-3.5" />
						Notes
					</button>
				</div>
			</div>

			<!-- Preferences Panel -->
			<div v-if="showPreferences" class="flex-1 overflow-y-auto">
				<CommandCenterAIPreferences @close="showPreferences = false; runAnalysis()" />
			</div>

			<!-- ═══ Chat Tab ═══ -->
			<template v-else-if="activeTab === 'chat'">
				<div class="flex-1 flex flex-col min-h-0">
					<!-- Chat Messages -->
					<div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
						<!-- Empty state with prompts -->
						<div v-if="quickMessages.length === 0 && !isQuickStreaming" class="flex flex-col items-center justify-center h-full px-4">
							<div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" :class="activePersona.iconBg">
								<UIcon :name="activePersona.icon" class="w-7 h-7" :class="activePersona.iconColor" />
							</div>
							<p class="text-sm font-medium text-foreground text-center mb-1">{{ activePersona.label }}</p>
							<p class="text-xs text-muted-foreground text-center mb-6 max-w-[240px]">{{ activePersona.description }}</p>
							<div class="flex flex-wrap gap-2 justify-center">
								<button
									v-for="prompt in smartPrompts"
									:key="prompt"
									@click="chatInput = prompt"
									class="px-3 py-1.5 rounded-full text-[11px] transition-all hover:scale-105"
									:class="activePersona.bgClass + ' text-foreground hover:shadow-sm'"
								>
									{{ prompt }}
								</button>
							</div>
							<!-- Chat History link -->
							<button
								@click="openFullChat"
								class="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
							>
								<UIcon name="i-heroicons-clock" class="w-3.5 h-3.5" />
								View Chat History
							</button>
						</div>

						<!-- Messages -->
						<template v-else>
							<div
								v-for="msg in quickMessages"
								:key="msg.id"
								class="flex gap-2 group"
								:class="msg.role === 'user' ? 'flex-row-reverse' : ''"
							>
								<div
									v-if="msg.role !== 'user'"
									class="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
									:class="activePersona.iconBg"
								>
									<UIcon :name="activePersona.icon" class="w-3 h-3" :class="activePersona.iconColor" />
								</div>
								<div class="max-w-[85%] relative">
									<div
										class="rounded-xl px-3 py-2 text-xs"
										:class="msg.role === 'user'
											? 'bg-primary text-primary-foreground'
											: 'bg-muted'"
									>
										<p v-if="msg.role === 'user'" class="whitespace-pre-wrap break-words">{{ msg.content }}</p>
										<div
											v-else
											class="prose prose-xs dark:prose-invert max-w-none break-words [&>p]:my-0.5"
											v-html="renderMarkdown(msg.content)"
										></div>
									</div>
									<!-- Hover actions (assistant messages only) -->
									<div
										v-if="msg.role === 'assistant'"
										class="absolute -bottom-2.5 left-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
									>
										<button
											@click="openTraySaveNote(msg)"
											class="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-background border border-gray-200 dark:border-gray-600 shadow-sm hover:bg-muted transition-colors"
											:class="traySavedIds.has(msg.id) ? 'text-primary' : 'text-muted-foreground'"
										>
											<UIcon
												:name="traySavedIds.has(msg.id) ? 'i-heroicons-bookmark-solid' : 'i-heroicons-bookmark'"
												class="w-2.5 h-2.5"
											/>
											{{ traySavedIds.has(msg.id) ? 'Saved' : 'Save' }}
										</button>
										<button
											@click="navigator.clipboard.writeText(msg.content)"
											class="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium text-muted-foreground bg-background border border-gray-200 dark:border-gray-600 shadow-sm hover:bg-muted transition-colors"
										>
											<UIcon name="i-heroicons-clipboard-document" class="w-2.5 h-2.5" />
											Copy
										</button>
									</div>
								</div>
							</div>
							<!-- Streaming -->
							<div v-if="quickStreamingContent" class="flex gap-2">
								<div
									class="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
									:class="activePersona.iconBg"
								>
									<UIcon :name="activePersona.icon" class="w-3 h-3 animate-pulse" :class="activePersona.iconColor" />
								</div>
								<div class="max-w-[85%] rounded-xl px-3 py-2 bg-muted text-xs">
									<div
										class="prose prose-xs dark:prose-invert max-w-none break-words [&>p]:my-0.5"
										v-html="renderMarkdown(quickStreamingContent)"
									></div>
									<span class="inline-block w-1.5 h-3 bg-primary/60 animate-pulse ml-0.5 rounded-sm"></span>
								</div>
							</div>
						</template>
					</div>

					<!-- Error -->
					<div v-if="quickError" class="mx-4 mb-2 flex items-center gap-1.5 p-2 bg-destructive/10 text-destructive rounded-lg text-[11px]">
						<UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5 flex-shrink-0" />
						<p class="flex-1">{{ quickError }}</p>
					</div>

					<!-- Chat Input -->
					<div class="border-t border-gray-100 dark:border-gray-700 p-3">
						<form @submit.prevent="handleChatSubmit" class="flex items-center gap-2">
							<div class="flex-1 relative">
								<UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-primary absolute left-3 top-1/2 -translate-y-1/2" />
								<input
									v-model="chatInput"
									type="text"
									placeholder="Ask about a client, project, or invoice..."
									:disabled="isQuickSending"
									@keydown="handleChatKeydown"
									class="w-full bg-muted/40 rounded-lg pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
								/>
							</div>
							<button
								type="submit"
								:disabled="!chatInput.trim() || isQuickSending"
								class="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
							>
								<UIcon
									v-if="isQuickSending"
									name="i-heroicons-arrow-path"
									class="w-4 h-4 animate-spin"
								/>
								<UIcon v-else name="i-heroicons-paper-airplane" class="w-4 h-4" />
							</button>
						</form>
						<div class="flex items-center justify-between mt-1.5">
							<p class="text-[10px] text-muted-foreground">AI may make mistakes.</p>
							<div class="flex items-center gap-2">
								<button
									v-if="quickMessages.length > 0"
									@click="clearQuickChat"
									class="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
								>
									New Chat
								</button>
								<button
									@click="openFullChat"
									class="text-[10px] text-primary hover:underline"
								>
									History
								</button>
							</div>
						</div>
					</div>
				</div>
			</template>

			<!-- ═══ Productivity Tab ═══ -->
			<template v-else-if="activeTab === 'productivity'">
				<!-- Productivity Score -->
				<div class="p-4 border-b border-gray-100 dark:border-gray-700">
					<CommandCenterProductivityMeter
						:score="metrics.productivityScore"
						:overdue-items="metrics.overdueItems"
						:pending-invoice-total="metrics.pendingInvoiceTotal"
						:tasks-completed-today="metrics.tasksCompletedToday"
						:active-projects="metrics.activeProjects"
						:unread-messages="metrics.unreadChannelMessages"
						:upcoming-meetings="metrics.upcomingMeetings"
					/>
				</div>

				<!-- Quick Actions -->
				<div class="p-4 border-b border-gray-100 dark:border-gray-700">
					<h3 class="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">Quick Actions</h3>
					<div class="grid grid-cols-3 gap-2">
						<button
							v-for="action in quickActions"
							:key="action.label"
							@click="handleQuickAction(action.route)"
							class="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-center"
						>
							<UIcon :name="action.icon" class="w-5 h-5 text-primary" />
							<span class="text-[10px] text-gray-600 dark:text-gray-400">{{ action.label }}</span>
						</button>
					</div>
				</div>

				<!-- Suggestions -->
				<div class="flex-1 overflow-y-auto">
					<div class="p-4">
						<div class="flex items-center justify-between mb-3">
							<h3 class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
								Smart Suggestions
								<span v-if="suggestions.length" class="text-gray-400 ml-1">({{ suggestions.length }})</span>
							</h3>
							<button
								@click="runAnalysis"
								:disabled="isAnalyzing"
								class="text-xs text-primary hover:underline disabled:opacity-50"
							>
								<UIcon v-if="isAnalyzing" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin inline" />
								<span v-else>Refresh</span>
							</button>
						</div>

						<!-- Category Filter -->
						<div class="flex gap-1 mb-3 overflow-x-auto pb-1 scrollbar-hide">
							<button
								v-for="cat in categories"
								:key="cat.value"
								@click="filterCategory = cat.value"
								:class="[
									filterCategory === cat.value
										? 'bg-primary text-white'
										: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
								]"
								class="text-[10px] px-2.5 py-1 rounded-full whitespace-nowrap transition-colors font-medium flex items-center gap-1"
							>
								{{ cat.label }}
								<span
									v-if="cat.value !== 'all' && suggestions.filter((s) => s.category === cat.value).length > 0"
									class="text-[9px] opacity-75"
								>
									{{ suggestions.filter((s) => s.category === cat.value).length }}
								</span>
							</button>
						</div>

						<!-- Suggestion Cards -->
						<div v-if="isAnalyzing" class="space-y-2">
							<div v-for="n in 4" :key="n" class="h-16 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
						</div>

						<div v-else-if="filteredSuggestions.length === 0" class="text-center py-8 text-gray-400 text-sm">
							<UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2" />
							<p>All caught up! No suggestions right now.</p>
						</div>

						<div v-else class="space-y-2">
							<CommandCenterSuggestionCard
								v-for="suggestion in filteredSuggestions"
								:key="suggestion.id"
								:suggestion="suggestion"
								@click="handleSuggestionClick(suggestion)"
							/>
						</div>
					</div>
				</div>
			</template>

			<!-- ═══ Notes Tab ═══ -->
			<template v-else-if="activeTab === 'notes'">
				<div class="flex-1 flex flex-col min-h-0">
					<!-- Search -->
					<div class="p-3 border-b border-gray-100 dark:border-gray-700">
						<input
							v-model="trayNotesSearch"
							placeholder="Search notes..."
							class="w-full text-xs px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-transparent placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
						/>
					</div>

					<!-- Notes list -->
					<div class="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
						<div v-if="trayNotesLoading" class="flex items-center justify-center py-8">
							<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-muted-foreground" />
						</div>

						<div v-else-if="trayNotes.length === 0" class="flex flex-col items-center justify-center py-8">
							<UIcon name="i-heroicons-bookmark" class="w-8 h-8 text-muted-foreground/30 mb-2" />
							<p class="text-xs text-muted-foreground">No saved notes yet</p>
						</div>

						<div
							v-for="note in trayNotes"
							:key="(note as any).id"
							@click="openTrayNote((note as any).id)"
							class="p-3 rounded-lg bg-muted/30 border border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-muted/50 transition-colors"
						>
							<div class="flex items-start justify-between gap-2">
								<h4 class="text-xs font-semibold text-foreground line-clamp-1 flex-1">
									{{ note.title || 'Untitled' }}
								</h4>
								<UIcon
									v-if="note.is_pinned"
									name="i-heroicons-star-solid"
									class="w-3 h-3 text-amber-500 flex-shrink-0"
								/>
							</div>
							<p class="text-[11px] text-muted-foreground line-clamp-2 mt-1">
								{{ note.excerpt }}
							</p>
							<div v-if="getTrayNoteTags(note).length > 0" class="flex flex-wrap gap-1 mt-2">
								<span
									v-for="tag in getTrayNoteTags(note).slice(0, 3)"
									:key="tag.id"
									class="px-1.5 py-0.5 rounded text-[9px] font-medium"
									:style="{ backgroundColor: (tag.color || '#6366f1') + '1a', color: tag.color || '#6366f1' }"
								>
									{{ tag.name }}
								</span>
							</div>
						</div>
					</div>

					<!-- View all link -->
					<div class="p-3 border-t border-gray-100 dark:border-gray-700">
						<button
							@click="router.push('/command-center/notes'); emit('close')"
							class="w-full text-xs text-center text-muted-foreground hover:text-primary transition-colors"
						>
							View all notes
						</button>
					</div>
				</div>
			</template>
		</div>
	</Transition>

	<!-- Overlay -->
	<Transition name="overlay">
		<div
			v-if="isOpen"
			class="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
			@click="emit('close')"
		/>
	</Transition>

	<!-- Save Note Modal -->
	<AISaveNoteModal
		v-model="showTraySaveNote"
		:message-content="traySaveMsg.content"
		:session-id="quickSessionId || ''"
		:message-id="traySaveMsg.id"
		@saved="onTrayNoteSaved"
	/>

	<!-- Note Detail Modal -->
	<AINoteDetailModal
		v-model="showTrayNoteDetail"
		:note-id="trayNoteDetailId"
		@deleted="loadTrayNotes"
		@updated="loadTrayNotes"
	/>
</template>

<style scoped>
.tray-enter-active,
.tray-leave-active {
	transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.tray-enter-from,
.tray-leave-to {
	transform: translateX(100%);
}

.overlay-enter-active,
.overlay-leave-active {
	transition: opacity 0.3s ease;
}
.overlay-enter-from,
.overlay-leave-to {
	opacity: 0;
}

.scrollbar-hide::-webkit-scrollbar {
	display: none;
}
.scrollbar-hide {
	-ms-overflow-style: none;
	scrollbar-width: none;
}
</style>
