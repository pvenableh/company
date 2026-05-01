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
const { user: trayUser } = useDirectusAuth();
const { selectedOrg } = useOrganization();
const { canAccess } = useOrgRole();
const { usageSummary, refresh: refreshTokenUsage } = useAITokens();
const trayToast = useToast();
const router = useRouter();

// ── Token meter (inline strip + reload picker) ──
const tokensUnlimited = computed(() => {
	const s = usageSummary.value;
	return !s || s.orgLimit === null || s.orgLimit === undefined;
});
const tokensUsedPct = computed(() => {
	const s = usageSummary.value;
	if (!s || !s.orgLimit) return 0;
	return Math.min(100, Math.round(((s.orgTokensUsed ?? 0) / s.orgLimit) * 100));
});
const tokensDepleted = computed(() => {
	const s = usageSummary.value;
	if (!s) return false;
	return (s.orgBalance != null && s.orgBalance <= 0) || tokensUsedPct.value >= 100;
});
const tokensBarClass = computed(() => {
	if (tokensUsedPct.value >= 90) return 'bg-destructive';
	if (tokensUsedPct.value >= 70) return 'bg-amber-500';
	return 'bg-primary/60';
});
const tokensTextClass = computed(() => {
	if (tokensUsedPct.value >= 90) return 'text-destructive';
	if (tokensUsedPct.value >= 70) return 'text-amber-500';
	return 'text-muted-foreground';
});
const canManageTokens = computed(() => canAccess('org_settings'));
const showReloadPicker = ref(false);
const reloadLoading = ref<string | null>(null);

function formatTokens(n: number | null | undefined): string {
	if (n == null) return '—';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
	return String(n);
}

const tokenPackages = [
	{ id: 'tokens_100k', name: '100K', tokens: 100_000, price: 9 },
	{ id: 'tokens_500k', name: '500K', tokens: 500_000, price: 39 },
	{ id: 'tokens_1_5m', name: '1.5M', tokens: 1_500_000, price: 99 },
];

async function buyTokens(packageId: string) {
	if (!trayUser.value || !selectedOrg.value) return;
	reloadLoading.value = packageId;
	try {
		const data = await $fetch<{ url: string }>('/api/stripe/tokens/checkout', {
			method: 'POST',
			body: {
				email: (trayUser.value as any).email,
				customerId: (trayUser.value as any).stripe_customer_id,
				packageId,
				organizationId: (selectedOrg.value as any)?.id || selectedOrg.value,
			},
		});
		if (data?.url) {
			window.location.href = data.url;
		}
	} catch (err: any) {
		trayToast.add({
			title: 'Could not start checkout',
			description: err?.data?.message || err?.message || 'Please try again',
			color: 'red',
		});
	} finally {
		reloadLoading.value = null;
	}
}

function openManageTokens() {
	router.push('/organization?tab=ai-usage');
	emit('close');
}

// Refresh token meter when tray opens (so it's fresh after navigation)
watch(() => props.isOpen, (open) => {
	if (open) refreshTokenUsage();
});

// Auto-collapse reload picker when tray closes
watch(() => props.isOpen, (open) => {
	if (!open) showReloadPicker.value = false;
});

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

// Feedback
const trayCorrectionTarget = ref<any>(null);
const trayCorrectionText = ref('');

const submitTrayFeedback = async (msg: any, rating: 'positive' | 'negative', correction?: string) => {
  try {
    await $fetch(`/api/ai/messages/${msg.id}/feedback`, {
      method: 'POST',
      body: { rating, correction },
    });
    msg.feedback = { rating, correction };
  } catch (err: any) {
    console.warn('[AITray] Feedback failed:', err.message);
  }
};

const openTrayCorrection = (msg: any) => {
  if (trayCorrectionTarget.value?.id === msg.id) {
    trayCorrectionTarget.value = null;
    trayCorrectionText.value = '';
    return;
  }
  trayCorrectionTarget.value = msg;
  trayCorrectionText.value = '';
};

const submitTrayCorrection = async () => {
  if (!trayCorrectionTarget.value) return;
  await submitTrayFeedback(trayCorrectionTarget.value, 'negative', trayCorrectionText.value || undefined);
  trayCorrectionTarget.value = null;
  trayCorrectionText.value = '';
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
	// Source attribution badges
	html = html.replace(/\[Source:\s*([^\]]+)\]/g,
		'<span class="inline-flex items-center px-1.5 py-0 rounded-full bg-primary/10 text-primary text-[9px] font-medium whitespace-nowrap align-baseline mx-0.5">$1</span>');
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
			class="fixed right-0 top-0 h-full w-full max-w-sm bg-background shadow-2xl z-50 flex flex-col overflow-hidden border-l border-border"
		>
			<!-- Header -->
			<div class="border-b border-border/30">
				<div class="flex items-center justify-between p-4 bg-gradient-to-r from-primary/5 to-violet-500/5">
					<div class="flex items-center gap-2">
						<div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="activePersona.iconBg">
							<UIcon :name="activePersona.icon" class="w-4 h-4" :class="activePersona.iconColor" />
						</div>
						<div>
							<h2 class="text-sm font-bold text-foreground">Earnest</h2>
							<p class="text-[10px] text-muted-foreground italic">"{{ activePersona.greeting }}"</p>
						</div>
					</div>
					<div class="flex items-center gap-1">
						<button
							v-if="canManageTokens"
							@click="openManageTokens"
							class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
							title="Manage AI tokens"
						>
							<UIcon name="i-heroicons-bolt" class="w-4 h-4" />
						</button>
						<button
							@click="showPreferences = !showPreferences"
							class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
							:class="showPreferences ? 'bg-primary/10 text-primary' : ''"
						>
							<UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4" :class="showPreferences ? 'text-primary' : 'text-muted-foreground'" />
						</button>
						<button
							@click="emit('close')"
							class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
						>
							<UIcon name="i-heroicons-x-mark" class="w-5 h-5 text-muted-foreground" />
						</button>
					</div>
				</div>
				<!-- Token Usage Strip + Reload Picker -->
				<div v-if="!tokensUnlimited && usageSummary" class="px-4 py-2 bg-background border-t border-border/20">
					<div class="flex items-center gap-2.5">
						<UIcon name="i-heroicons-bolt" class="w-3.5 h-3.5 flex-shrink-0" :class="tokensTextClass" />
						<span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-shrink-0">Tokens</span>
						<div class="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
							<div
								class="h-full rounded-full transition-all duration-500"
								:class="tokensBarClass"
								:style="{ width: `${Math.min(tokensUsedPct, 100)}%` }"
							/>
						</div>
						<span class="text-[10px] font-medium tabular-nums flex-shrink-0" :class="tokensTextClass">
							{{ tokensUsedPct }}%
						</span>
						<button
							v-if="canManageTokens"
							@click="showReloadPicker = !showReloadPicker"
							class="text-[10px] font-medium px-2 py-0.5 rounded-md transition-colors flex-shrink-0"
							:class="tokensDepleted || tokensUsedPct >= 70
								? 'bg-primary text-primary-foreground hover:bg-primary/90'
								: 'text-primary hover:bg-primary/10'"
						>
							{{ showReloadPicker ? 'Close' : 'Reload' }}
						</button>
					</div>
					<!-- Reload picker -->
					<div v-if="showReloadPicker && canManageTokens" class="mt-2 grid grid-cols-3 gap-1.5">
						<button
							v-for="pkg in tokenPackages"
							:key="pkg.id"
							:disabled="reloadLoading !== null"
							@click="buyTokens(pkg.id)"
							class="flex flex-col items-center justify-center py-2 px-1 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-60 disabled:cursor-wait"
						>
							<UIcon
								v-if="reloadLoading === pkg.id"
								name="i-heroicons-arrow-path"
								class="w-3.5 h-3.5 animate-spin text-primary mb-0.5"
							/>
							<span v-else class="text-[11px] font-bold text-foreground leading-none">{{ pkg.name }}</span>
							<span class="text-[9px] text-muted-foreground mt-0.5">${{ pkg.price }}</span>
						</button>
					</div>
					<!-- Member fallback -->
					<p v-if="!canManageTokens && (tokensDepleted || tokensUsedPct >= 90)" class="text-[10px] text-muted-foreground mt-1.5">
						Ask your admin to top up tokens.
					</p>
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
				<div v-if="!showPreferences" class="flex border-b border-border/30">
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
											class="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-background border border-border shadow-sm hover:bg-muted transition-colors"
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
											class="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium text-muted-foreground bg-background border border-border shadow-sm hover:bg-muted transition-colors"
										>
											<UIcon name="i-heroicons-clipboard-document" class="w-2.5 h-2.5" />
											Copy
										</button>
										<button
											@click="submitTrayFeedback(msg, 'positive')"
											class="flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-background border border-border shadow-sm hover:bg-muted transition-colors"
											:class="msg.feedback?.rating === 'positive' ? 'text-green-500' : 'text-muted-foreground'"
											title="Helpful"
										>
											<UIcon name="i-heroicons-hand-thumb-up" class="w-2.5 h-2.5" />
										</button>
										<button
											@click="openTrayCorrection(msg)"
											class="flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-background border border-border shadow-sm hover:bg-muted transition-colors"
											:class="msg.feedback?.rating === 'negative' ? 'text-red-500' : 'text-muted-foreground'"
											title="Not helpful"
										>
											<UIcon name="i-heroicons-hand-thumb-down" class="w-2.5 h-2.5" />
										</button>
									</div>
									<!-- Correction input -->
									<div
										v-if="trayCorrectionTarget?.id === msg.id"
										class="mt-0.5 ml-1 flex gap-1 items-end"
									>
										<textarea
											v-model="trayCorrectionText"
											placeholder="What was wrong? (optional)"
											class="flex-1 text-[11px] rounded border border-border bg-background px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
											rows="2"
											@keydown.enter.ctrl="submitTrayCorrection"
										/>
										<button
											@click="submitTrayCorrection"
											class="px-2 py-1 rounded text-[9px] font-medium bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors shrink-0"
										>
											Submit
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
					<div class="border-t border-border/30 p-3">
						<form @submit.prevent="handleChatSubmit" class="flex items-center gap-2">
							<div class="flex-1 relative">
								<EarnestIcon class="w-4 h-4 text-primary absolute left-3 top-1/2 -translate-y-1/2" />
								<input
									v-model="chatInput"
									type="text"
									placeholder="Ask about clients, leads, tickets, projects, invoices..."
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
				<div class="p-4 border-b border-border/30">
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
				<div class="p-4 border-b border-border/30">
					<h3 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick Actions</h3>
					<div class="grid grid-cols-3 gap-2">
						<button
							v-for="action in quickActions"
							:key="action.label"
							@click="handleQuickAction(action.route)"
							class="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-muted transition-colors text-center"
						>
							<UIcon :name="action.icon" class="w-5 h-5 text-primary" />
							<span class="text-[10px] text-muted-foreground">{{ action.label }}</span>
						</button>
					</div>
				</div>

				<!-- Suggestions -->
				<div class="flex-1 overflow-y-auto">
					<div class="p-4">
						<div class="flex items-center justify-between mb-3">
							<h3 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
								Smart Suggestions
								<span v-if="suggestions.length" class="text-muted-foreground/70 ml-1">({{ suggestions.length }})</span>
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
										: 'bg-muted text-muted-foreground',
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
							<div v-for="n in 4" :key="n" class="h-16 bg-muted rounded-lg animate-pulse" />
						</div>

						<div v-else-if="filteredSuggestions.length === 0" class="text-center py-8 text-muted-foreground/70 text-sm">
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
					<div class="p-3 border-b border-border/30">
						<input
							v-model="trayNotesSearch"
							placeholder="Search notes..."
							class="w-full text-xs px-3 py-2 border border-border rounded-lg bg-transparent placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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
							class="p-3 rounded-lg bg-muted/30 border border-border/30 cursor-pointer hover:bg-muted/50 transition-colors"
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
					<div class="p-3 border-t border-border/30">
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
