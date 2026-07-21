/**
 * DEPRECATED shim — the persona concept has been retired. There is one Earnest.
 *
 * Tone is no longer a user-selectable setting: the server always speaks in
 * Earnest's single voice and `ai_preferences.persona` is gone. This file only
 * still exists so the last legacy consumers (CommandCenter AIChat/AITray) keep
 * compiling; it is removed together with those surfaces in the legacy-Talk
 * cleanup. Do not add new callers.
 */

export interface AIPersona {
	value: string;
	label: string;
	icon: string;
	description: string;
	greeting: string;
	iconColor: string;
	bgClass: string;
	activeClass: string;
	iconBg: string;
	prompts: string[];
}

const EARNEST: AIPersona = {
	value: 'default',
	label: 'Earnest',
	icon: 'i-heroicons-sparkles',
	description: 'Your warm, encouraging ops partner — projects, leads, tickets, revenue.',
	greeting: 'Hey! Good to see you. What are we working on today?',
	iconColor: 'text-primary',
	bgClass: 'bg-primary/10 border-primary/20',
	activeClass: 'bg-primary/15 ring-2 ring-primary/40 shadow-md shadow-primary/10',
	iconBg: 'bg-primary/20',
	prompts: [
		'Summarize my overdue tasks',
		'Help draft an invoice',
		'Project status overview',
		'Suggest priorities for today',
	],
};

const personas: AIPersona[] = [EARNEST];
const selectedPersona = ref('default');

export function useAIPersona() {
	const activePersona = computed<AIPersona>(() => EARNEST);
	const setPersona = (_value: string) => {
		/* no-op — there is only one Earnest */
	};

	return {
		personas,
		selectedPersona,
		activePersona,
		setPersona,
	};
}
