/**
 * Shared Earnest AI chat state — used by AITray quick chat and AIChat full page.
 * Provides a single active quick-chat conversation that persists across tray open/close.
 */

interface ChatMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	date_created: string;
}

// Module-level shared state
const quickMessages = ref<ChatMessage[]>([]);
const quickSessionId = ref<string | null>(null);
const isQuickSending = ref(false);
const isQuickStreaming = ref(false);
const quickStreamingContent = ref('');
const quickError = ref<string | null>(null);

export function useEarnestChat() {
	const { selectedClient } = useClients();
	const { selectedOrg } = useOrganization();
	const { selectedPersona } = useAIPersona();

	const sendQuickMessage = async (content: string) => {
		if (!content.trim() || isQuickSending.value) return;

		isQuickSending.value = true;
		isQuickStreaming.value = true;
		quickStreamingContent.value = '';
		quickError.value = null;

		// Optimistically add user message
		const userMsg: ChatMessage = {
			id: `temp-${Date.now()}`,
			role: 'user',
			content: content.trim(),
			date_created: new Date().toISOString(),
		};
		quickMessages.value.push(userMsg);

		try {
			const response = await fetch('/api/ai/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionId: quickSessionId.value || undefined,
					message: content.trim(),
					clientId: selectedClient.value && selectedClient.value !== 'org' ? selectedClient.value : undefined,
					organizationId: (selectedOrg.value as any)?.id || undefined,
					responseStyle: selectedPersona.value !== 'default' ? selectedPersona.value : undefined,
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
							quickStreamingContent.value += data.content;
						} else if (data.type === 'done') {
							if (data.sessionId) {
								quickSessionId.value = data.sessionId;
							}
							quickMessages.value.push({
								id: `assistant-${Date.now()}`,
								role: 'assistant',
								content: data.content,
								date_created: new Date().toISOString(),
							});
							quickStreamingContent.value = '';
						} else if (data.type === 'error') {
							quickError.value = data.error;
						}
					} catch {
						// skip malformed JSON
					}
				}
			}
		} catch (e: any) {
			console.error('[EarnestChat] Stream error:', e);
			quickError.value = e.message || 'Failed to get AI response';
			quickMessages.value = quickMessages.value.filter((m) => m.id !== userMsg.id);
		} finally {
			isQuickSending.value = false;
			isQuickStreaming.value = false;
			quickStreamingContent.value = '';
		}
	};

	const clearQuickChat = () => {
		quickMessages.value = [];
		quickSessionId.value = null;
		quickStreamingContent.value = '';
		quickError.value = null;
	};

	return {
		quickMessages,
		quickSessionId,
		isQuickSending,
		isQuickStreaming,
		quickStreamingContent,
		quickError,
		sendQuickMessage,
		clearQuickChat,
	};
}
