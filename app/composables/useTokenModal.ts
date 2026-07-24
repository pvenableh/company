/**
 * useTokenModal — opens the AI-tokens surface. It's now the `token-management`
 * slide-over panel (registry) rather than a globally-mounted bottom sheet, but
 * the open/close API is unchanged so every caller (Earnest panel, contextual
 * chat + generative canvas 402/403 handlers) keeps working.
 *
 * `openTokenModal` is called from async error handlers that have lost the
 * component setup context, so it restores the Nuxt context before touching the
 * slide-over composables (which use useState/useRoute/useRouter).
 */
export function openTokenModal() {
	const nuxt = useNuxtApp();
	nuxt.runWithContext(() => {
		useAppSlideOver('token-management').open('_');
	});
}

export function closeTokenModal() {
	const nuxt = useNuxtApp();
	nuxt.runWithContext(() => {
		const slide = useAppSlideOver('token-management');
		if (slide.isOpen.value) slide.close();
	});
}
