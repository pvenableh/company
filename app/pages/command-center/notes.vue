<script setup lang="ts">
/**
 * AI Notes browse page — search, filter by tags, view saved AI insights.
 */

definePageMeta({ layout: 'app' });

const {
  notes, tags, selectedTagIds, searchQuery, isLoading, meta,
  fetchNotes, fetchTags, deleteNote, togglePin, archiveNote,
  categoryTags, entityTags,
} = useAINotes();

const showDetail = ref(false);
const detailNoteId = ref('');
const page = ref(1);

// Fetch on mount
onMounted(async () => {
  await Promise.all([fetchTags(), fetchNotes()]);
});

// Re-fetch when filters change
watch([selectedTagIds, searchQuery], () => {
  page.value = 1;
  fetchNotes({ page: 1, tags: selectedTagIds.value, search: searchQuery.value });
}, { deep: true });

const loadPage = (p: number) => {
  page.value = p;
  fetchNotes({ page: p, tags: selectedTagIds.value, search: searchQuery.value });
};

const toggleTagFilter = (tagId: string) => {
  const idx = selectedTagIds.value.indexOf(tagId);
  if (idx >= 0) {
    selectedTagIds.value.splice(idx, 1);
  } else {
    selectedTagIds.value.push(tagId);
  }
};

const openNote = (noteId: string) => {
  detailNoteId.value = noteId;
  showDetail.value = true;
};

const handleDelete = async (noteId: string) => {
  await deleteNote(noteId);
};

const handlePin = async (noteId: string) => {
  await togglePin(noteId);
  fetchNotes({ page: page.value, tags: selectedTagIds.value, search: searchQuery.value });
};

const handleArchive = async (noteId: string) => {
  await archiveNote(noteId);
};

const formatRelativeDate = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
};

// Extract tags from a note's junction data
const getNoteTags = (note: any) => {
  return (note.tags || [])
    .map((jn: any) => jn.ai_tags_id)
    .filter(Boolean);
};
</script>

<template>
  <div class="flex h-full bg-background">
    <!-- Tag Filter Sidebar -->
    <div class="w-56 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 p-4 overflow-y-auto">
      <h2 class="text-sm font-semibold text-foreground mb-4">AI Notes</h2>

      <!-- Search -->
      <div class="mb-4">
        <UInput
          v-model="searchQuery"
          placeholder="Search notes..."
          size="sm"
        >
          <template #leading>
            <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4 text-muted-foreground" />
          </template>
        </UInput>
      </div>

      <!-- Category tags -->
      <div v-if="categoryTags.length > 0" class="mb-4">
        <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Categories</p>
        <div class="space-y-1">
          <button
            v-for="tag in categoryTags"
            :key="tag.id"
            @click="toggleTagFilter(tag.id as string)"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors"
            :class="selectedTagIds.includes(tag.id as string)
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
          >
            <span
              class="w-2 h-2 rounded-full flex-shrink-0"
              :style="{ backgroundColor: tag.color || '#6366f1' }"
            />
            {{ tag.name }}
          </button>
        </div>
      </div>

      <!-- Entity tags -->
      <div v-if="entityTags.length > 0">
        <p class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Linked Entities</p>
        <div class="space-y-1">
          <button
            v-for="tag in entityTags"
            :key="tag.id"
            @click="toggleTagFilter(tag.id as string)"
            class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors"
            :class="selectedTagIds.includes(tag.id as string)
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
          >
            <span
              class="w-2 h-2 rounded-full flex-shrink-0"
              :style="{ backgroundColor: tag.color || '#6366f1' }"
            />
            <span class="flex-1 truncate text-left">{{ tag.name }}</span>
            <span class="text-[9px] text-muted-foreground">{{ tag.entity_type }}</span>
          </button>
        </div>
      </div>

      <!-- Clear filters -->
      <button
        v-if="selectedTagIds.length > 0"
        @click="selectedTagIds = []; searchQuery = ''"
        class="mt-3 w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Clear all filters
      </button>
    </div>

    <!-- Notes Grid -->
    <div class="flex-1 p-6 overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-lg font-bold text-foreground">Saved Notes</h1>
          <p class="text-xs text-muted-foreground mt-0.5">
            {{ meta.total }} note{{ meta.total !== 1 ? 's' : '' }}
            <span v-if="selectedTagIds.length > 0"> (filtered)</span>
          </p>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="flex items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-muted-foreground" />
      </div>

      <!-- Empty state -->
      <div v-else-if="notes.length === 0" class="flex flex-col items-center justify-center py-16">
        <UIcon name="i-heroicons-bookmark" class="w-12 h-12 text-muted-foreground/30 mb-3" />
        <h3 class="text-sm font-medium text-foreground mb-1">No notes yet</h3>
        <p class="text-xs text-muted-foreground max-w-xs text-center">
          Save insights from AI conversations by hovering over a response and clicking "Save".
        </p>
      </div>

      <!-- Note Cards -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div
          v-for="note in notes"
          :key="(note as any).id"
          @click="openNote((note as any).id)"
          class="ios-card p-4 cursor-pointer hover:shadow-md transition-shadow group relative"
        >
          <!-- Pin indicator -->
          <UIcon
            v-if="note.is_pinned"
            name="i-heroicons-star-solid"
            class="absolute top-3 right-3 w-3.5 h-3.5 text-amber-500"
          />

          <!-- Title -->
          <h3 class="text-sm font-semibold text-foreground mb-1.5 line-clamp-2 pr-6">
            {{ note.title || 'Untitled Note' }}
          </h3>

          <!-- Excerpt -->
          <p class="text-xs text-muted-foreground line-clamp-3 mb-3">
            {{ note.excerpt }}
          </p>

          <!-- Tags -->
          <div v-if="getNoteTags(note).length > 0" class="flex flex-wrap gap-1 mb-2">
            <span
              v-for="tag in getNoteTags(note)"
              :key="tag.id"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
              :style="{ backgroundColor: (tag.color || '#6366f1') + '1a', color: tag.color || '#6366f1' }"
            >
              <span
                class="w-1.5 h-1.5 rounded-full"
                :style="{ backgroundColor: tag.color || '#6366f1' }"
              />
              {{ tag.name }}
            </span>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between">
            <span class="text-[10px] text-muted-foreground">
              {{ formatRelativeDate((note as any).date_created) }}
            </span>

            <!-- Hover actions -->
            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                @click.stop="handlePin((note as any).id)"
                class="p-1 rounded hover:bg-muted transition-colors"
                :title="note.is_pinned ? 'Unpin' : 'Pin'"
              >
                <UIcon
                  :name="note.is_pinned ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
                  class="w-3.5 h-3.5"
                  :class="note.is_pinned ? 'text-amber-500' : 'text-muted-foreground'"
                />
              </button>
              <button
                @click.stop="handleArchive((note as any).id)"
                class="p-1 rounded hover:bg-muted transition-colors"
                title="Archive"
              >
                <UIcon name="i-heroicons-archive-box" class="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button
                @click.stop="handleDelete((note as any).id)"
                class="p-1 rounded hover:bg-destructive/10 transition-colors"
                title="Delete"
              >
                <UIcon name="i-heroicons-trash" class="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="meta.totalPages > 1" class="flex items-center justify-center gap-2 mt-6">
        <button
          v-for="p in meta.totalPages"
          :key="p"
          @click="loadPage(p)"
          class="w-8 h-8 rounded-lg text-xs font-medium transition-colors"
          :class="page === p
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted'"
        >
          {{ p }}
        </button>
      </div>
    </div>

    <!-- Note Detail Modal -->
    <AINoteDetailModal
      v-model="showDetail"
      :note-id="detailNoteId"
      @deleted="handleDelete"
      @updated="fetchNotes({ page, tags: selectedTagIds, search: searchQuery })"
    />
  </div>
</template>
