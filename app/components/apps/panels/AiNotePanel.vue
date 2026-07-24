<!--
  AiNotePanel — slide-over panel for a single saved AI note (view full
  content, edit title + tags, pin/delete, jump to the source conversation).
  Replaces the AI/NoteDetailModal bottom sheet; opened via
  useAppSlideOver('ai-note').open(noteId) from the command-center note lists.

  Self-contained per the registry contract: loads the note by id, writes
  directly through useAINotes, and notifies the entity bus ('ai_notes') on
  update/delete so the list behind it repaints.
-->
<script setup lang="ts">
import { notifyEntityChange } from '~/composables/useEntityStore';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { fetchNote, updateNote, deleteNote, togglePin, activeNote } = useAINotes();

const isEditing = ref(false);
const editTitle = ref('');
const editTagIds = ref<string[]>([]);
const saving = ref(false);

async function load(id: string) {
	if (!id) return;
	await fetchNote(id);
	if (activeNote.value) {
		editTitle.value = activeNote.value.title || '';
		editTagIds.value = ((activeNote.value.tags || []) as any[])
			.map((jn: any) => jn.ai_tags_id?.id || jn.ai_tags_id)
			.filter(Boolean);
	}
}
watch(() => props.id, load, { immediate: true });

const note = computed(() => activeNote.value);

const noteTags = computed(() =>
	((note.value?.tags || []) as any[]).map((jn: any) => jn.ai_tags_id).filter(Boolean),
);

async function saveEdits() {
	if (!note.value || saving.value) return;
	saving.value = true;
	try {
		const id = (note.value as any).id;
		await updateNote(id, { title: editTitle.value, tagIds: editTagIds.value });
		isEditing.value = false;
		notifyEntityChange('ai_notes', { id: String(id), op: 'update' });
		await fetchNote(id);
	} finally {
		saving.value = false;
	}
}

async function handlePin() {
	if (!note.value) return;
	const id = (note.value as any).id;
	await togglePin(id);
	await fetchNote(id);
	notifyEntityChange('ai_notes', { id: String(id), op: 'update' });
}

async function handleDelete() {
	if (!note.value) return;
	const id = (note.value as any).id;
	await deleteNote(id);
	notifyEntityChange('ai_notes', { id: String(id), op: 'remove' });
	emit('close');
}

function goToSession() {
	if (!note.value?.source_session) return;
	const sessionId = typeof note.value.source_session === 'string'
		? note.value.source_session
		: (note.value.source_session as any)?.id;
	if (sessionId) {
		emit('close');
		openEarnestSession(String(sessionId));
	}
}

// Simple markdown rendering (mirrors the former modal).
const renderedContent = computed(() => {
	let html = note.value?.content || '';
	html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
	html = html.replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-muted rounded text-xs">$1</code>');
	html = html.replace(/^### (.*)/gm, '<h4 class="font-semibold text-sm mt-3 mb-1">$1</h4>');
	html = html.replace(/^## (.*)/gm, '<h3 class="font-semibold mt-3 mb-1">$1</h3>');
	html = html.replace(/^# (.*)/gm, '<h2 class="font-bold text-lg mt-3 mb-1">$1</h2>');
	html = html.replace(/^- (.*)/gm, '<li class="ml-4 list-disc text-sm my-0.5">$1</li>');
	html = html.replace(/\n\n/g, '</p><p class="my-2">');
	html = html.replace(/\n/g, '<br>');
	return `<p class="my-2">${html}</p>`;
});

function formatDate(dateStr: string) {
	if (!dateStr) return '';
	return new Date(dateStr).toLocaleDateString('en-US', {
		month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
	});
}

const title = computed(() => note.value?.title || 'Untitled Note');
const subtitle = computed(() => formatDate((note.value as any)?.date_created));
</script>

<template>
	<AppSlideOverShell :title="title" :subtitle="subtitle" @close="emit('close')">
		<template #actions>
			<button
				class="p-1.5 rounded-lg hover:bg-muted transition-colors"
				:title="note?.is_pinned ? 'Unpin' : 'Pin'"
				@click="handlePin"
			>
				<EIcon
					:name="note?.is_pinned ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
					class="w-4 h-4"
					:class="note?.is_pinned ? 'text-warning' : 'text-muted-foreground'"
				/>
			</button>
			<button
				v-if="!isEditing"
				class="p-1.5 rounded-lg hover:bg-muted transition-colors"
				title="Edit"
				@click="isEditing = true"
			>
				<EIcon name="i-heroicons-pencil" class="w-4 h-4 text-muted-foreground" />
			</button>
			<button
				class="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
				title="Delete"
				@click="handleDelete"
			>
				<EIcon name="i-heroicons-trash" class="w-4 h-4 text-muted-foreground hover:text-destructive" />
			</button>
		</template>

		<div v-if="!note" class="flex items-center justify-center py-16">
			<span class="spinner-ios spinner-ios--lg" role="status" aria-label="Loading" />
		</div>

		<template v-else>
			<!-- Title editor (edit mode) -->
			<div v-if="isEditing" class="mb-4 space-y-1">
				<p class="text-xs font-medium text-muted-foreground">Title</p>
				<EInput v-model="editTitle" size="sm" placeholder="Note title..." />
			</div>

			<!-- Tags -->
			<div v-if="isEditing" class="mb-4">
				<p class="text-xs font-medium text-muted-foreground mb-1.5">Tags</p>
				<AITagSelector v-model="editTagIds" />
			</div>
			<div v-else-if="noteTags.length > 0" class="flex flex-wrap gap-1.5 mb-4">
				<span
					v-for="tag in noteTags"
					:key="tag.id"
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
					:style="{ backgroundColor: (tag.color || '#6366f1') + '1a', color: tag.color || '#6366f1' }"
				>
					<span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: tag.color || '#6366f1' }" />
					{{ tag.name }}
					<span v-if="tag.entity_type" class="text-[9px] opacity-70">({{ tag.entity_type }})</span>
				</span>
			</div>

			<!-- Markdown content -->
			<div class="prose prose-sm dark:prose-invert max-w-none" v-html="renderedContent" />
		</template>

		<template #footer>
			<div class="flex items-center justify-between w-full">
				<button
					v-if="note?.source_session"
					class="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
					@click="goToSession"
				>
					<EIcon name="i-heroicons-chat-bubble-left-right" class="w-3.5 h-3.5" />
					View source conversation
				</button>
				<span v-else />

				<div class="flex gap-2">
					<EButton v-if="isEditing" variant="ghost" size="sm" @click="isEditing = false">Cancel</EButton>
					<EButton v-if="isEditing" size="sm" :loading="saving" @click="saveEdits">Save Changes</EButton>
					<EButton v-else variant="ghost" size="sm" @click="emit('close')">Close</EButton>
				</div>
			</div>
		</template>
	</AppSlideOverShell>
</template>
