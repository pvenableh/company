<script setup lang="ts">
/**
 * Team AI Activity — Admin-only view of all org AI conversations and notes.
 * Requires owner or admin role.
 */

definePageMeta({ layout: 'app', middleware: ['auth'] });
useHead({ title: 'Team Activity | Earnest' });

const { selectedOrg } = useOrganization();
const config = useRuntimeConfig();

// Lazy init — useOrgRole uses useDirectusItems which depends on lodash and fails during SSR
const _orgRole = ref<ReturnType<typeof useOrgRole> | null>(null);
const isOrgAdminOrAbove = computed(() => _orgRole.value?.isOrgAdminOrAbove?.value ?? false);
onMounted(() => { _orgRole.value = useOrgRole(); });

const organizationId = computed(() => (selectedOrg.value as any)?.id || selectedOrg.value || '');

const activeTab = ref<'sessions' | 'notes'>('sessions');

// ── Sessions state ──
const sessions = ref<any[]>([]);
const members = ref<any[]>([]);
const sessionsMeta = ref({ page: 1, limit: 25, total: 0, totalPages: 0 });
const sessionsLoading = ref(false);
const sessionsPage = ref(1);
const filterMemberId = ref('');

// ── Notes state ──
const teamNotes = ref<any[]>([]);
const notesMeta = ref({ page: 1, limit: 25, total: 0, totalPages: 0 });
const notesLoading = ref(false);
const notesPage = ref(1);
const notesSearch = ref('');

// ── Session viewer ──
const showViewer = ref(false);
const viewerSessionId = ref('');

// ── Note detail ──
const showNoteDetail = ref(false);
const noteDetailId = ref('');

// ── Fetch sessions ──
const fetchSessions = async () => {
  if (!organizationId.value) return;
  sessionsLoading.value = true;
  try {
    const params: Record<string, any> = {
      organizationId: organizationId.value,
      limit: 25,
      page: sessionsPage.value,
    };
    if (filterMemberId.value) {
      params.userId = filterMemberId.value;
    }
    const response = await $fetch('/api/ai/manage/team-sessions', { params }) as any;
    sessions.value = response?.sessions || [];
    members.value = response?.members || [];
    if (response?.meta) sessionsMeta.value = response.meta;
  } catch (err: any) {
    console.error('[team-ai] Failed to fetch sessions:', err);
  } finally {
    sessionsLoading.value = false;
  }
};

// ── Fetch notes ──
const fetchTeamNotes = async () => {
  if (!organizationId.value) return;
  notesLoading.value = true;
  try {
    const params: Record<string, any> = {
      organizationId: organizationId.value,
      limit: 25,
      page: notesPage.value,
    };
    if (filterMemberId.value) params.userId = filterMemberId.value;
    if (notesSearch.value.trim()) params.search = notesSearch.value.trim();
    const response = await $fetch('/api/ai/manage/team-notes', { params }) as any;
    teamNotes.value = response?.notes || [];
    if (response?.meta) notesMeta.value = response.meta;
  } catch (err: any) {
    console.error('[team-ai] Failed to fetch notes:', err);
  } finally {
    notesLoading.value = false;
  }
};

// ── Watch filters ──
watch([filterMemberId], () => {
  sessionsPage.value = 1;
  notesPage.value = 1;
  fetchSessions();
  if (activeTab.value === 'notes') fetchTeamNotes();
});

watch(activeTab, (tab) => {
  if (tab === 'notes' && teamNotes.value.length === 0) fetchTeamNotes();
});

watch(notesSearch, () => {
  notesPage.value = 1;
  fetchTeamNotes();
});

// ── Init ──
onMounted(() => { fetchSessions(); });

// ── Helpers ──
const getUserAvatar = (avatarId: string | null) => {
  if (!avatarId) return '';
  return `${config.public.directusUrl || ''}/assets/${avatarId}?width=64&height=64&fit=cover`;
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

const openSession = (sessionId: string) => {
  viewerSessionId.value = sessionId;
  showViewer.value = true;
};

const openNote = (noteId: string) => {
  noteDetailId.value = noteId;
  showNoteDetail.value = true;
};

const getNoteTags = (note: any) => {
  return (note.tags || []).map((jn: any) => jn.ai_tags_id).filter(Boolean);
};

const getNoteUserName = (note: any) => {
  if (note.user?.first_name) {
    return [note.user.first_name, note.user.last_name].filter(Boolean).join(' ');
  }
  return 'Unknown';
};
</script>

<template>
  <div class="h-full bg-background">
    <ClientOnly>
      <template #fallback>
        <div class="flex items-center justify-center h-full">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </template>

    <!-- Access denied for non-admins -->
    <div v-if="!isOrgAdminOrAbove" class="flex flex-col items-center justify-center h-full px-4">
      <UIcon name="i-heroicons-lock-closed" class="w-12 h-12 text-muted-foreground/30 mb-3" />
      <h2 class="text-sm font-semibold text-foreground mb-1">Admin Access Required</h2>
      <p class="text-xs text-muted-foreground text-center max-w-xs">
        Only organization owners and admins can view team AI activity.
      </p>
    </div>

    <!-- Admin view -->
    <div v-else class="flex flex-col h-full">
      <!-- Header -->
      <div class="border-b border-gray-100 dark:border-gray-700 px-6 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-lg font-bold text-foreground">Team Activity</h1>
            <p class="text-xs text-muted-foreground mt-0.5">
              View conversations and saved notes across your organization
            </p>
          </div>

          <!-- Member filter -->
          <div class="flex items-center gap-3">
            <select
              v-model="filterMemberId"
              class="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">All members</option>
              <option v-for="m in members" :key="m.id" :value="m.id">
                {{ m.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-0 mt-4 border-b border-gray-100 dark:border-gray-700 -mb-[1px]">
          <button
            @click="activeTab = 'sessions'"
            class="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors"
            :class="activeTab === 'sessions'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'"
          >
            <UIcon name="i-heroicons-chat-bubble-left-right" class="w-3.5 h-3.5" />
            Sessions
            <span class="text-[10px] text-muted-foreground ml-1">({{ sessionsMeta.total }})</span>
          </button>
          <button
            @click="activeTab = 'notes'"
            class="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors"
            :class="activeTab === 'notes'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'"
          >
            <UIcon name="i-heroicons-bookmark" class="w-3.5 h-3.5" />
            Notes
            <span class="text-[10px] text-muted-foreground ml-1">({{ notesMeta.total }})</span>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        <!-- ═══ Sessions Tab ═══ -->
        <template v-if="activeTab === 'sessions'">
          <div v-if="sessionsLoading" class="flex items-center justify-center py-12">
            <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-muted-foreground" />
          </div>

          <div v-else-if="sessions.length === 0" class="flex flex-col items-center justify-center py-16">
            <UIcon name="i-heroicons-chat-bubble-left-right" class="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p class="text-sm text-muted-foreground">No conversations found.</p>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="session in sessions"
              :key="session.id"
              @click="openSession(session.id)"
              class="flex items-center gap-4 p-4 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-muted/30 cursor-pointer transition-colors group"
            >
              <!-- Member avatar -->
              <img
                v-if="session.user_avatar"
                :src="getUserAvatar(session.user_avatar)"
                class="w-9 h-9 rounded-full flex-shrink-0"
                alt=""
              />
              <div
                v-else
                class="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"
              >
                <UIcon name="i-heroicons-user" class="w-4 h-4 text-primary" />
              </div>

              <!-- Info -->
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-medium text-foreground truncate">
                  {{ session.title || 'Untitled Conversation' }}
                </h3>
                <p class="text-[10px] text-muted-foreground mt-0.5">
                  {{ session.user_name }}
                  <span v-if="session.user_role" class="ml-1 opacity-60">{{ session.user_role }}</span>
                </p>
              </div>

              <!-- Date -->
              <span class="text-[10px] text-muted-foreground flex-shrink-0">
                {{ formatRelativeDate(session.date_updated || session.date_created) }}
              </span>

              <!-- View icon -->
              <UIcon
                name="i-heroicons-chevron-right"
                class="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0"
              />
            </div>
          </div>

          <!-- Pagination -->
          <div v-if="sessionsMeta.totalPages > 1" class="flex items-center justify-center gap-2 mt-6">
            <button
              v-for="p in sessionsMeta.totalPages"
              :key="p"
              @click="sessionsPage = p; fetchSessions()"
              class="w-8 h-8 rounded-lg text-xs font-medium transition-colors"
              :class="sessionsPage === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'"
            >
              {{ p }}
            </button>
          </div>
        </template>

        <!-- ═══ Notes Tab ═══ -->
        <template v-else-if="activeTab === 'notes'">
          <!-- Search -->
          <div class="mb-4">
            <UInput
              v-model="notesSearch"
              placeholder="Search team notes..."
              size="sm"
              class="max-w-xs"
            >
              <template #leading>
                <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4 text-muted-foreground" />
              </template>
            </UInput>
          </div>

          <div v-if="notesLoading" class="flex items-center justify-center py-12">
            <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-muted-foreground" />
          </div>

          <div v-else-if="teamNotes.length === 0" class="flex flex-col items-center justify-center py-16">
            <UIcon name="i-heroicons-bookmark" class="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p class="text-sm text-muted-foreground">No saved notes found.</p>
          </div>

          <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <div
              v-for="note in teamNotes"
              :key="note.id"
              @click="openNote(note.id)"
              class="ios-card p-4 cursor-pointer hover:shadow-md transition-shadow"
            >
              <!-- Author -->
              <div class="flex items-center gap-2 mb-2">
                <img
                  v-if="note.user?.avatar"
                  :src="getUserAvatar(note.user.avatar)"
                  class="w-5 h-5 rounded-full"
                  alt=""
                />
                <div
                  v-else
                  class="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center"
                >
                  <UIcon name="i-heroicons-user" class="w-3 h-3 text-primary" />
                </div>
                <span class="text-[10px] text-muted-foreground">{{ getNoteUserName(note) }}</span>
                <UIcon
                  v-if="note.is_pinned"
                  name="i-heroicons-star-solid"
                  class="w-3 h-3 text-amber-500 ml-auto"
                />
              </div>

              <!-- Title -->
              <h3 class="text-sm font-semibold text-foreground mb-1.5 line-clamp-2">
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
                  class="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  :style="{ backgroundColor: (tag.color || '#6366f1') + '1a', color: tag.color || '#6366f1' }"
                >
                  {{ tag.name }}
                </span>
              </div>

              <!-- Date -->
              <span class="text-[10px] text-muted-foreground">
                {{ formatRelativeDate(note.date_created) }}
              </span>
            </div>
          </div>

          <!-- Pagination -->
          <div v-if="notesMeta.totalPages > 1" class="flex items-center justify-center gap-2 mt-6">
            <button
              v-for="p in notesMeta.totalPages"
              :key="p"
              @click="notesPage = p; fetchTeamNotes()"
              class="w-8 h-8 rounded-lg text-xs font-medium transition-colors"
              :class="notesPage === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'"
            >
              {{ p }}
            </button>
          </div>
        </template>
      </div>
    </div>

    </ClientOnly>

    <!-- Session Viewer Modal -->
    <AITeamSessionViewer
      v-model="showViewer"
      :session-id="viewerSessionId"
      :organization-id="organizationId"
    />

    <!-- Note Detail Modal -->
    <AINoteDetailModal
      v-model="showNoteDetail"
      :note-id="noteDetailId"
      @updated="fetchTeamNotes"
    />
  </div>
</template>
