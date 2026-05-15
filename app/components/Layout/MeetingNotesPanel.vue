<!--
  In-meeting notes & decisions capture (dock panel).
  Visible only when the route is /meeting/<roomName>. The roomName -> meetingId
  lookup is cached in window during the parent page's fetchMeeting flow; we
  re-resolve here to stay decoupled from that page's internals.
-->
<template>
	<div class="h-full flex flex-col">
		<!-- Quick capture form -->
		<div class="px-4 py-3 border-b border-border/40">
			<textarea
				ref="textareaRef"
				v-model="draft"
				rows="2"
				placeholder="What was decided? What did you notice?"
				class="w-full text-sm resize-none rounded-lg bg-muted/40 border border-border/40 focus:border-primary/40 focus:outline-none px-3 py-2 placeholder:text-muted-foreground/60"
				@keydown.meta.enter.prevent="submit('note')"
				@keydown.ctrl.enter.prevent="submit('note')"
			/>
			<div class="flex items-center gap-1.5 mt-2">
				<button
					class="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-success/10 hover:bg-success/20 text-success dark:text-success text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
					:disabled="!canSubmit"
					title="Save as note (⌘↵)"
					@click="submit('note')"
				>
					<Icon name="lucide:notebook-pen" class="w-3.5 h-3.5" />
					Note
				</button>
				<button
					class="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-warning/10 hover:bg-warning/20 text-warning dark:text-warning text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
					:disabled="!canSubmit"
					title="Save as decision"
					@click="submit('decision')"
				>
					<Icon name="lucide:gavel" class="w-3.5 h-3.5" />
					Decision
				</button>
			</div>
			<p v-if="error" class="text-[11px] text-destructive mt-2">{{ error }}</p>
		</div>

		<!-- Recent entries -->
		<div class="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-4 py-3 space-y-2">
			<div
				v-if="loading && notes.length === 0"
				class="text-center text-[12px] text-muted-foreground py-4"
			>
				Loading…
			</div>
			<div
				v-else-if="notes.length === 0"
				class="text-center text-[12px] text-muted-foreground py-6"
			>
				No notes yet. Capture decisions and observations as the meeting goes — they'll feed the recap.
			</div>
			<div
				v-for="note in recentReversed"
				:key="note.id"
				class="rounded-lg border border-border/40 bg-card p-3 group"
			>
				<div class="flex items-center justify-between gap-2 mb-1">
					<span
						:class="[
							'inline-flex items-center gap-1 px-1.5 h-4 rounded-full text-[9px] font-bold uppercase tracking-wider',
							note.note_type === 'decision'
								? 'bg-warning/15 text-warning dark:text-warning'
								: 'bg-success/15 text-success dark:text-success',
						]"
					>
						<Icon
							:name="note.note_type === 'decision' ? 'lucide:gavel' : 'lucide:notebook-pen'"
							class="w-2.5 h-2.5"
						/>
						{{ note.note_type }}
					</span>
					<button
						v-if="canDelete(note)"
						class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
						title="Delete"
						@click="handleDelete(note.id)"
					>
						<Icon name="lucide:x" class="w-3 h-3" />
					</button>
				</div>
				<p class="text-[13px] text-foreground whitespace-pre-wrap leading-snug">{{ note.content }}</p>
				<p class="text-[10px] text-muted-foreground mt-1.5">
					<span v-if="note.author">{{ authorLabel(note.author) }} · </span>
					<span>{{ relativeTime(note.date_created) }}</span>
				</p>
			</div>
		</div>

		<NuxtLink
			v-if="meetingId"
			:to="`/meetings/${meetingId}`"
			target="_blank"
			class="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-2 border-t border-border/40"
		>
			Open recap
			<Icon name="lucide:arrow-up-right" class="w-3 h-3" />
		</NuxtLink>
	</div>
</template>

<script setup lang="ts">
import type { MeetingNoteRow } from '~/composables/useMeetingNotes';

const route = useRoute();
const { user: sessionUser, loggedIn } = useUserSession();
const currentUserId = computed(() =>
	loggedIn.value ? (sessionUser.value as any)?.id || null : null,
);

// Resolve the meetingId from the room name in the route. We cache by room
// since the dock can stay mounted as the user navigates within the meeting.
const roomName = computed(() => String(route.params.roomName || ''));
const meetingId = ref<string | null>(null);

const resolveMeetingId = async () => {
	if (!roomName.value) {
		meetingId.value = null;
		return;
	}
	try {
		const res = await $fetch<{ data: { id: string } }>('/api/video/meeting-info', {
			params: { roomName: roomName.value },
		});
		meetingId.value = res?.data?.id || null;
	} catch {
		meetingId.value = null;
	}
};

watch(roomName, resolveMeetingId, { immediate: true });

const meetingIdRef = computed(() => meetingId.value);
const { notes, loading, submitting, error, fetchNotes, addNote, removeNote } =
	useMeetingNotes(meetingIdRef);

watch(meetingIdRef, (id) => {
	if (id) fetchNotes();
});

const draft = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const canSubmit = computed(() => !submitting.value && draft.value.trim().length > 0);

const recentReversed = computed(() => [...notes.value].reverse().slice(0, 50));

const submit = async (type: 'note' | 'decision') => {
	if (!canSubmit.value) return;
	const offset = computeOffsetSeconds();
	const created = await addNote(draft.value, type, offset);
	if (created) draft.value = '';
	textareaRef.value?.focus();
};

// We don't have meeting.actual_start in the panel; the parent page caches
// `__earnestMeetingStart` on window when the call begins so notes can be
// stamped. If unset, we just send null and the recap UI shows the wall-clock
// time instead.
const computeOffsetSeconds = (): number | null => {
	const start = (globalThis as any).__earnestMeetingStart as string | number | undefined;
	if (!start) return null;
	const startMs = typeof start === 'number' ? start : Date.parse(start);
	if (!Number.isFinite(startMs)) return null;
	return Math.max(0, Math.round((Date.now() - startMs) / 1000));
};

const handleDelete = async (id: string) => {
	if (!confirm('Delete this note?')) return;
	await removeNote(id);
};

const canDelete = (n: MeetingNoteRow) =>
	currentUserId.value && n.author?.id === currentUserId.value;

const authorLabel = (a?: MeetingNoteRow['author']) => {
	if (!a) return '';
	const name = `${a.first_name || ''} ${a.last_name || ''}`.trim();
	return name || 'Member';
};

const relativeTime = (s: string) => {
	if (!s) return '';
	const diffMs = Date.now() - Date.parse(s);
	if (!Number.isFinite(diffMs)) return s;
	const sec = Math.round(diffMs / 1000);
	if (sec < 5) return 'just now';
	if (sec < 60) return `${sec}s ago`;
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.round(min / 60);
	if (hr < 24) return `${hr}h ago`;
	return new Date(s).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
</script>

<style scoped>
.hide-scrollbar {
	scrollbar-width: none;
	-ms-overflow-style: none;
}
.hide-scrollbar::-webkit-scrollbar {
	display: none;
}
</style>
