// composables/useHomeMode.ts
//
// The per-user home surface: 'classic' (command-center dashboard, default) or
// 'presence' (the calm conversational Earnest home). Stored on
// directus_users.home_mode via readMe/updateMe — the same per-user-pref pattern
// as useAppPalette / useAiAutonomy — so the choice sticks across devices.

export type HomeMode = 'classic' | 'presence';

export function useHomeMode() {
	// Presence is the default surface for everyone; 'classic' is the explicit
	// opt-out. NULL/unset → presence, so new users land calm-first too.
	const mode = useState<HomeMode>('home-mode', () => 'presence');
	const loaded = useState<boolean>('home-mode-loaded', () => false);
	const { readMe, updateMe } = useDirectusUsers();

	function normalize(v: unknown): HomeMode {
		return v === 'classic' ? 'classic' : 'presence';
	}

	async function load(force = false) {
		if (loaded.value && !force) return;
		try {
			const me = (await readMe({ fields: ['home_mode'] })) as { home_mode?: string | null } | null;
			mode.value = normalize(me?.home_mode);
			loaded.value = true;
		} catch {
			/* stays 'classic' */
		}
	}

	async function setMode(next: HomeMode) {
		if (next === mode.value) return;
		const prev = mode.value;
		mode.value = next; // optimistic
		try {
			await updateMe({ home_mode: next });
		} catch {
			mode.value = prev;
			const { toast } = await import('vue-sonner');
			toast.error('Could not save your home preference');
		}
	}

	function toggle() {
		setMode(mode.value === 'presence' ? 'classic' : 'presence');
	}

	const isPresence = computed(() => mode.value === 'presence');

	return { mode, isPresence, loaded, load, setMode, toggle };
}
