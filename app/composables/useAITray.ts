export const aiTrayOpen = ref(false);
export const aiTrayInitialPrompt = ref('');

export function openAITray(prompt = '') {
	aiTrayInitialPrompt.value = prompt;
	aiTrayOpen.value = true;
}

export function closeAITray() {
	aiTrayOpen.value = false;
	aiTrayInitialPrompt.value = '';
}
