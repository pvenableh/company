/**
 * Meeting notes — Phase 4.
 *
 * Shared state for the in-meeting capture dock panel + the post-meeting
 * detail page. Routes through /api/video/meetings/[id]/notes (server-side
 * org gate) rather than the generic /api/directus/items path so a future
 * Daily app-message broadcast can be wired in one place.
 */

interface MeetingNoteUser {
	id?: string;
	first_name?: string | null;
	last_name?: string | null;
}

export interface MeetingNoteRow {
	id: string;
	note_type: 'note' | 'decision';
	content: string;
	meeting_offset_seconds: number | null;
	date_created: string;
	author?: MeetingNoteUser | null;
}

const cache = new Map<string, ReturnType<typeof makeStore>>();

function makeStore() {
	const notes = ref<MeetingNoteRow[]>([]);
	const loading = ref(false);
	const submitting = ref(false);
	const error = ref<string | null>(null);
	return { notes, loading, submitting, error };
}

export function useMeetingNotes(meetingIdRef: Ref<string | null | undefined> | string) {
	const meetingId = computed(() =>
		typeof meetingIdRef === 'string' ? meetingIdRef : (meetingIdRef.value || ''),
	);

	function getStore(id: string) {
		if (!cache.has(id)) cache.set(id, makeStore());
		return cache.get(id)!;
	}

	const fetchNotes = async () => {
		const id = meetingId.value;
		if (!id) return;
		const store = getStore(id);
		store.loading.value = true;
		store.error.value = null;
		try {
			const res = await $fetch<{ data: MeetingNoteRow[] }>(`/api/video/meetings/${id}/notes`);
			store.notes.value = res.data || [];
		} catch (e: any) {
			store.error.value = e.statusMessage || e.message || 'Failed to load notes';
		} finally {
			store.loading.value = false;
		}
	};

	const addNote = async (content: string, noteType: 'note' | 'decision', offsetSeconds?: number | null) => {
		const id = meetingId.value;
		if (!id) return null;
		const trimmed = content.trim();
		if (!trimmed) return null;
		const store = getStore(id);
		store.submitting.value = true;
		store.error.value = null;
		try {
			const res = await $fetch<{ data: MeetingNoteRow }>(`/api/video/meetings/${id}/notes`, {
				method: 'POST',
				body: {
					content: trimmed,
					note_type: noteType,
					meeting_offset_seconds: offsetSeconds ?? null,
				},
			});
			if (res.data) {
				store.notes.value = [...store.notes.value, res.data];
			}
			return res.data;
		} catch (e: any) {
			store.error.value = e.statusMessage || e.message || 'Failed to save note';
			return null;
		} finally {
			store.submitting.value = false;
		}
	};

	const removeNote = async (noteId: string) => {
		const id = meetingId.value;
		if (!id) return false;
		const store = getStore(id);
		try {
			await $fetch(`/api/video/meetings/${id}/notes/${noteId}`, { method: 'DELETE' });
			store.notes.value = store.notes.value.filter((n) => n.id !== noteId);
			return true;
		} catch (e: any) {
			store.error.value = e.statusMessage || e.message || 'Failed to delete note';
			return false;
		}
	};

	const store = computed(() => (meetingId.value ? getStore(meetingId.value) : makeStore()));

	return {
		notes: computed(() => store.value.notes.value),
		loading: computed(() => store.value.loading.value),
		submitting: computed(() => store.value.submitting.value),
		error: computed(() => store.value.error.value),
		fetchNotes,
		addNote,
		removeNote,
	};
}
