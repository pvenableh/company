<script setup lang="ts">
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Files | Earnest' });

const config = useRuntimeConfig();
const { list: listFiles, upload: uploadFile, remove: removeFile, getUrl } = useDirectusFiles();
const { getChildren: getSubfolders, create: createFolder, remove: removeFolder, get: getFolder } = useFolders();
const { getOrgFolderId } = useOrgFolders();

// ── State ────────────────────────────────────────────────────────────────────
const currentFolderId = ref<string | null>(null);
const breadcrumbs = ref<{ id: string | null; name: string }[]>([{ id: null, name: 'Files' }]);
const folders = ref<any[]>([]);
const files = ref<any[]>([]);
const loading = ref(true);
const search = ref('');
const viewMode = ref<'grid' | 'list'>('grid');
const uploading = ref(false);
const uploadProgress = ref(0);

// ── Modals ───────────────────────────────────────────────────────────────────
const showNewFolder = ref(false);
const newFolderName = ref('');
const creatingFolder = ref(false);
const showRenameModal = ref(false);
const renameTarget = ref<{ id: string; name: string; type: 'folder' | 'file' } | null>(null);
const renameName = ref('');
const renameSaving = ref(false);

// ── Fetch data ───────────────────────────────────────────────────────────────
async function fetchContents() {
  loading.value = true;
  try {
    const [folderData, fileData] = await Promise.all([
      getSubfolders(currentFolderId.value),
      listFiles({
        filter: currentFolderId.value
          ? { folder: { _eq: currentFolderId.value } }
          : { folder: { _null: true } },
        fields: ['id', 'title', 'filename_download', 'type', 'filesize', 'width', 'height', 'uploaded_on', 'modified_on'],
        sort: ['-uploaded_on'],
        limit: 200,
      }),
    ]);

    folders.value = folderData || [];
    files.value = (fileData as any[]) || [];
  } catch (err) {
    console.error('Failed to fetch contents:', err);
  } finally {
    loading.value = false;
  }
}

// ── Navigation ───────────────────────────────────────────────────────────────
async function navigateToFolder(folderId: string, folderName: string) {
  currentFolderId.value = folderId;
  breadcrumbs.value.push({ id: folderId, name: folderName });
  await fetchContents();
}

async function navigateToBreadcrumb(index: number) {
  const crumb = breadcrumbs.value[index];
  currentFolderId.value = crumb.id;
  breadcrumbs.value = breadcrumbs.value.slice(0, index + 1);
  await fetchContents();
}

async function navigateUp() {
  if (breadcrumbs.value.length <= 1) return;
  breadcrumbs.value.pop();
  const parent = breadcrumbs.value[breadcrumbs.value.length - 1];
  currentFolderId.value = parent.id;
  await fetchContents();
}

// ── Filtered items ───────────────────────────────────────────────────────────
const filteredFolders = computed(() => {
  if (!search.value) return folders.value;
  const q = search.value.toLowerCase();
  return folders.value.filter((f: any) => f.name?.toLowerCase().includes(q));
});

const filteredFiles = computed(() => {
  if (!search.value) return files.value;
  const q = search.value.toLowerCase();
  return files.value.filter((f: any) =>
    (f.title || f.filename_download || '').toLowerCase().includes(q)
  );
});

const totalItems = computed(() => filteredFolders.value.length + filteredFiles.value.length);

// ── File helpers ─────────────────────────────────────────────────────────────
function getFileIcon(type: string): string {
  if (!type) return 'lucide:file';
  if (type.startsWith('image/')) return 'lucide:image';
  if (type.startsWith('video/')) return 'lucide:video';
  if (type.startsWith('audio/')) return 'lucide:music';
  if (type.includes('pdf')) return 'lucide:file-text';
  if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) return 'lucide:table';
  if (type.includes('document') || type.includes('word')) return 'lucide:file-text';
  if (type.includes('presentation') || type.includes('powerpoint')) return 'lucide:presentation';
  if (type.includes('zip') || type.includes('archive') || type.includes('compressed')) return 'lucide:archive';
  return 'lucide:file';
}

function getFileIconColor(type: string): string {
  if (!type) return 'text-muted-foreground';
  if (type.startsWith('image/')) return 'text-blue-400';
  if (type.startsWith('video/')) return 'text-purple-400';
  if (type.startsWith('audio/')) return 'text-pink-400';
  if (type.includes('pdf')) return 'text-red-400';
  if (type.includes('spreadsheet') || type.includes('excel')) return 'text-emerald-400';
  if (type.includes('document') || type.includes('word')) return 'text-blue-500';
  return 'text-muted-foreground';
}

function isImage(type: string): boolean {
  return type?.startsWith('image/') || false;
}

function getThumbnailUrl(fileId: string): string {
  return `${config.public.directusUrl}/assets/${fileId}?width=200&height=200&fit=cover&quality=80`;
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// Uses getFriendlyDateThree from utils/dates.ts
function formatDate(dateStr: string | null): string {
  return getFriendlyDateThree(dateStr);
}

function getFileName(file: any): string {
  return file.title || file.filename_download || 'Untitled';
}

function openFile(file: any) {
  const url = `${config.public.directusUrl}/assets/${file.id}`;
  window.open(url, '_blank');
}

// ── Create folder ────────────────────────────────────────────────────────────
async function handleCreateFolder() {
  if (!newFolderName.value.trim()) return;
  creatingFolder.value = true;
  try {
    await createFolder({
      name: newFolderName.value.trim(),
      parent: currentFolderId.value,
    });
    newFolderName.value = '';
    showNewFolder.value = false;
    await fetchContents();
  } catch (err) {
    console.error('Failed to create folder:', err);
  } finally {
    creatingFolder.value = false;
  }
}

// ── Upload ───────────────────────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null);

function triggerUpload() {
  fileInput.value?.click();
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const uploadFiles = input.files;
  if (!uploadFiles?.length) return;

  uploading.value = true;
  uploadProgress.value = 0;

  try {
    const total = uploadFiles.length;
    for (let i = 0; i < total; i++) {
      await uploadFile(uploadFiles[i], {
        folder: currentFolderId.value || undefined,
      });
      uploadProgress.value = Math.round(((i + 1) / total) * 100);
    }
    await fetchContents();
  } catch (err) {
    console.error('Upload failed:', err);
  } finally {
    uploading.value = false;
    uploadProgress.value = 0;
    input.value = '';
  }
}

// ── Drag and drop upload ─────────────────────────────────────────────────────
const isDragOver = ref(false);

function onDragOver(e: DragEvent) {
  e.preventDefault();
  isDragOver.value = true;
}

function onDragLeave() {
  isDragOver.value = false;
}

async function onDrop(e: DragEvent) {
  e.preventDefault();
  isDragOver.value = false;

  const droppedFiles = e.dataTransfer?.files;
  if (!droppedFiles?.length) return;

  uploading.value = true;
  uploadProgress.value = 0;

  try {
    const total = droppedFiles.length;
    for (let i = 0; i < total; i++) {
      await uploadFile(droppedFiles[i], {
        folder: currentFolderId.value || undefined,
      });
      uploadProgress.value = Math.round(((i + 1) / total) * 100);
    }
    await fetchContents();
  } catch (err) {
    console.error('Drop upload failed:', err);
  } finally {
    uploading.value = false;
    uploadProgress.value = 0;
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────
async function handleDeleteFile(file: any) {
  if (!confirm(`Delete "${getFileName(file)}"?`)) return;
  try {
    await removeFile(file.id);
    await fetchContents();
  } catch (err) {
    console.error('Failed to delete file:', err);
  }
}

async function handleDeleteFolder(folder: any) {
  if (!confirm(`Delete folder "${folder.name}"? This will not delete files inside it.`)) return;
  try {
    await removeFolder(folder.id);
    await fetchContents();
  } catch (err) {
    console.error('Failed to delete folder:', err);
  }
}

// ── Rename ───────────────────────────────────────────────────────────────────
function startRename(item: any, type: 'folder' | 'file') {
  renameTarget.value = {
    id: item.id,
    name: type === 'folder' ? item.name : getFileName(item),
    type,
  };
  renameName.value = renameTarget.value.name;
  showRenameModal.value = true;
}

async function handleRename() {
  if (!renameTarget.value || !renameName.value.trim()) return;
  renameSaving.value = true;
  try {
    if (renameTarget.value.type === 'folder') {
      const { update: updateFolderFn } = useFolders();
      await updateFolderFn(renameTarget.value.id, { name: renameName.value.trim() });
    } else {
      const { update: updateFileFn } = useDirectusFiles();
      await updateFileFn(renameTarget.value.id, { title: renameName.value.trim() });
    }
    showRenameModal.value = false;
    renameTarget.value = null;
    await fetchContents();
  } catch (err) {
    console.error('Rename failed:', err);
  } finally {
    renameSaving.value = false;
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
onMounted(async () => {
  // Default to the current org's folder tree
  const orgFolderId = getOrgFolderId();
  if (orgFolderId) {
    currentFolderId.value = orgFolderId;
    const { currentOrg } = useOrganization();
    breadcrumbs.value = [{ id: orgFolderId, name: currentOrg.value?.name || 'Files' }];
  }
  await fetchContents();
});
</script>

<template>
  <LayoutPageContainer
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Drag overlay -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isDragOver"
        class="fixed inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none"
      >
        <div class="ios-card p-12 text-center">
          <Icon name="lucide:upload-cloud" class="w-16 h-16 text-primary mx-auto mb-4" />
          <p class="text-lg font-medium">Drop files to upload</p>
          <p class="text-sm text-muted-foreground mt-1">Files will be added to the current folder</p>
        </div>
      </div>
    </Transition>

    <!-- Hidden file input -->
    <input
      ref="fileInput"
      type="file"
      multiple
      class="hidden"
      @change="handleFileUpload"
    />

    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-xl font-semibold">Files</h1>
        <p class="text-sm text-muted-foreground">
          {{ totalItems }} item{{ totalItems !== 1 ? 's' : '' }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="showNewFolder = true">
          <Icon name="lucide:folder-plus" class="w-4 h-4 mr-1" />
          New Folder
        </Button>
        <Button size="sm" @click="triggerUpload">
          <Icon name="lucide:upload" class="w-4 h-4 mr-1" />
          Upload
        </Button>
      </div>
    </div>

    <!-- Breadcrumbs -->
    <div class="flex items-center gap-1 mb-4 text-sm overflow-x-auto">
      <template v-for="(crumb, i) in breadcrumbs" :key="i">
        <button
          v-if="i < breadcrumbs.length - 1"
          class="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          @click="navigateToBreadcrumb(i)"
        >
          {{ crumb.name }}
        </button>
        <span v-else class="font-medium shrink-0">{{ crumb.name }}</span>
        <Icon v-if="i < breadcrumbs.length - 1" name="lucide:chevron-right" class="w-3 h-3 text-muted-foreground/50 shrink-0" />
      </template>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center gap-3 mb-5">
      <input
        v-model="search"
        type="search"
        placeholder="Search files & folders..."
        class="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
      />
      <div class="flex items-center rounded-md border bg-background">
        <button
          class="px-2.5 py-2 transition-colors"
          :class="viewMode === 'grid' ? 'text-foreground bg-muted/40' : 'text-muted-foreground hover:text-foreground'"
          @click="viewMode = 'grid'"
        >
          <Icon name="lucide:layout-grid" class="w-4 h-4" />
        </button>
        <button
          class="px-2.5 py-2 transition-colors"
          :class="viewMode === 'list' ? 'text-foreground bg-muted/40' : 'text-muted-foreground hover:text-foreground'"
          @click="viewMode = 'list'"
        >
          <Icon name="lucide:list" class="w-4 h-4" />
        </button>
      </div>
      <button
        v-if="breadcrumbs.length > 1"
        class="px-2.5 py-2 rounded-md border bg-background text-muted-foreground hover:text-foreground transition-colors"
        @click="navigateUp"
      >
        <Icon name="lucide:arrow-up" class="w-4 h-4" />
      </button>
    </div>

    <!-- Upload progress -->
    <div v-if="uploading" class="mb-4">
      <div class="flex items-center gap-3 text-sm text-muted-foreground mb-1">
        <Icon name="lucide:loader-2" class="w-4 h-4 animate-spin" />
        Uploading... {{ uploadProgress }}%
      </div>
      <div class="w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          class="h-full bg-primary rounded-full transition-all duration-300"
          :style="{ width: `${uploadProgress}%` }"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
      <p class="text-sm text-muted-foreground">Loading files...</p>
    </div>

    <!-- Empty -->
    <div v-else-if="totalItems === 0 && !search" class="flex flex-col items-center justify-center py-24 gap-4">
      <Icon name="lucide:folder-open" class="w-16 h-16 text-muted-foreground/20" />
      <div class="text-center">
        <p class="text-sm font-medium text-muted-foreground">This folder is empty</p>
        <p class="text-xs text-muted-foreground/70 mt-1">Upload files or create a folder to get started</p>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" @click="showNewFolder = true">
          <Icon name="lucide:folder-plus" class="w-4 h-4 mr-1" />
          New Folder
        </Button>
        <Button size="sm" @click="triggerUpload">
          <Icon name="lucide:upload" class="w-4 h-4 mr-1" />
          Upload Files
        </Button>
      </div>
    </div>

    <!-- No results -->
    <div v-else-if="totalItems === 0 && search" class="flex flex-col items-center justify-center py-24 gap-3">
      <Icon name="lucide:search-x" class="w-10 h-10 text-muted-foreground/30" />
      <p class="text-sm text-muted-foreground">No results for "{{ search }}"</p>
    </div>

    <!-- ═══════════ GRID VIEW ═══════════ -->
    <template v-else-if="viewMode === 'grid'">
      <!-- Folders -->
      <div v-if="filteredFolders.length" class="mb-6">
        <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Folders</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <div
            v-for="folder in filteredFolders"
            :key="folder.id"
            class="ios-card p-4 cursor-pointer hover:ring-1 hover:ring-white/10 transition-all group"
            @click="navigateToFolder(folder.id, folder.name)"
          >
            <div class="flex items-start justify-between mb-2">
              <Icon name="lucide:folder" class="w-8 h-8 text-amber-400" />
              <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <button
                  class="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title="Rename"
                  @click.stop="startRename(folder, 'folder')"
                >
                  <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
                </button>
                <button
                  class="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete"
                  @click.stop="handleDeleteFolder(folder)"
                >
                  <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <p class="text-sm font-medium truncate">{{ folder.name }}</p>
          </div>
        </div>
      </div>

      <!-- Files -->
      <div v-if="filteredFiles.length">
        <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Files</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <div
            v-for="file in filteredFiles"
            :key="file.id"
            class="ios-card overflow-hidden cursor-pointer hover:ring-1 hover:ring-white/10 transition-all group"
            @click="openFile(file)"
          >
            <!-- Image thumbnail -->
            <div v-if="isImage(file.type)" class="aspect-square bg-muted/20 overflow-hidden">
              <img
                :src="getThumbnailUrl(file.id)"
                :alt="getFileName(file)"
                class="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <!-- File icon -->
            <div v-else class="aspect-square bg-muted/10 flex items-center justify-center">
              <Icon :name="getFileIcon(file.type)" :class="[getFileIconColor(file.type), 'w-12 h-12']" />
            </div>

            <div class="p-3">
              <div class="flex items-start justify-between gap-1">
                <p class="text-xs font-medium truncate flex-1">{{ getFileName(file) }}</p>
                <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 shrink-0">
                  <button
                    class="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    title="Rename"
                    @click.stop="startRename(file, 'file')"
                  >
                    <Icon name="lucide:pencil" class="w-3 h-3" />
                  </button>
                  <button
                    class="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete"
                    @click.stop="handleDeleteFile(file)"
                  >
                    <Icon name="lucide:trash-2" class="w-3 h-3" />
                  </button>
                </div>
              </div>
              <p class="text-[10px] text-muted-foreground mt-0.5">
                {{ formatFileSize(file.filesize) }}
                <span v-if="file.uploaded_on"> · {{ formatDate(file.uploaded_on) }}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════════ LIST VIEW ═══════════ -->
    <template v-else>
      <!-- Table header -->
      <div class="hidden md:grid grid-cols-[1fr_100px_120px_80px] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border/40 mb-1">
        <span>Name</span>
        <span>Size</span>
        <span>Modified</span>
        <span></span>
      </div>

      <!-- Folders -->
      <div
        v-for="folder in filteredFolders"
        :key="folder.id"
        class="grid grid-cols-1 md:grid-cols-[1fr_100px_120px_80px] gap-2 md:gap-4 items-center px-4 py-3 rounded-lg hover:bg-muted/20 cursor-pointer transition-colors group"
        @click="navigateToFolder(folder.id, folder.name)"
      >
        <div class="flex items-center gap-3">
          <Icon name="lucide:folder" class="w-5 h-5 text-amber-400 shrink-0" />
          <span class="text-sm font-medium truncate">{{ folder.name }}</span>
        </div>
        <span class="text-xs text-muted-foreground hidden md:block">—</span>
        <span class="text-xs text-muted-foreground hidden md:block">—</span>
        <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            class="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            @click.stop="startRename(folder, 'folder')"
          >
            <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
          </button>
          <button
            class="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
            @click.stop="handleDeleteFolder(folder)"
          >
            <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Files (virtualized for large lists) -->
      <VirtualList
        v-if="filteredFiles.length > 50"
        :items="filteredFiles"
        :estimate-size="52"
        class="max-h-[calc(100vh-280px)]"
      >
        <template #item="{ item: file }">
          <div
            class="grid grid-cols-1 md:grid-cols-[1fr_100px_120px_80px] gap-2 md:gap-4 items-center px-4 py-3 rounded-lg hover:bg-muted/20 cursor-pointer transition-colors group"
            @click="openFile(file)"
          >
            <div class="flex items-center gap-3">
              <img
                v-if="isImage(file.type)"
                :src="getThumbnailUrl(file.id)"
                class="w-8 h-8 rounded object-cover shrink-0"
                loading="lazy"
              />
              <Icon v-else :name="getFileIcon(file.type)" :class="[getFileIconColor(file.type), 'w-5 h-5 shrink-0']" />
              <span class="text-sm truncate">{{ getFileName(file) }}</span>
            </div>
            <span class="text-xs text-muted-foreground hidden md:block">{{ formatFileSize(file.filesize) }}</span>
            <span class="text-xs text-muted-foreground hidden md:block">{{ formatDate(file.modified_on || file.uploaded_on) }}</span>
            <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                class="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                @click.stop="startRename(file, 'file')"
              >
                <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
              </button>
              <button
                class="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                @click.stop="handleDeleteFile(file)"
              >
                <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </template>
      </VirtualList>

      <!-- Files (standard rendering for small lists) -->
      <template v-else>
        <div
          v-for="file in filteredFiles"
          :key="file.id"
          class="grid grid-cols-1 md:grid-cols-[1fr_100px_120px_80px] gap-2 md:gap-4 items-center px-4 py-3 rounded-lg hover:bg-muted/20 cursor-pointer transition-colors group"
          @click="openFile(file)"
        >
          <div class="flex items-center gap-3">
            <img
              v-if="isImage(file.type)"
              :src="getThumbnailUrl(file.id)"
              class="w-8 h-8 rounded object-cover shrink-0"
              loading="lazy"
            />
            <Icon v-else :name="getFileIcon(file.type)" :class="[getFileIconColor(file.type), 'w-5 h-5 shrink-0']" />
            <span class="text-sm truncate">{{ getFileName(file) }}</span>
          </div>
          <span class="text-xs text-muted-foreground hidden md:block">{{ formatFileSize(file.filesize) }}</span>
          <span class="text-xs text-muted-foreground hidden md:block">{{ formatDate(file.modified_on || file.uploaded_on) }}</span>
          <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              class="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              @click.stop="startRename(file, 'file')"
            >
              <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
            </button>
            <button
              class="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
              @click.stop="handleDeleteFile(file)"
            >
              <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </template>
    </template>

    <!-- ═══════════ MODALS ═══════════ -->

    <!-- New Folder Modal -->
    <Teleport to="body">
      <div
        v-if="showNewFolder"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="showNewFolder = false"
      >
        <div class="ios-card shadow-xl w-full max-w-sm mx-4 p-6">
          <h2 class="font-semibold mb-4">New Folder</h2>
          <form @submit.prevent="handleCreateFolder">
            <input
              v-model="newFolderName"
              autofocus
              required
              class="w-full rounded-md border bg-background px-3 py-2 text-sm mb-4"
              placeholder="Folder name"
            />
            <div class="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" @click="showNewFolder = false">Cancel</Button>
              <Button type="submit" size="sm" :disabled="creatingFolder">
                {{ creatingFolder ? 'Creating...' : 'Create' }}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Rename Modal -->
    <Teleport to="body">
      <div
        v-if="showRenameModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="showRenameModal = false"
      >
        <div class="ios-card shadow-xl w-full max-w-sm mx-4 p-6">
          <h2 class="font-semibold mb-4">Rename {{ renameTarget?.type === 'folder' ? 'Folder' : 'File' }}</h2>
          <form @submit.prevent="handleRename">
            <input
              v-model="renameName"
              autofocus
              required
              class="w-full rounded-md border bg-background px-3 py-2 text-sm mb-4"
              placeholder="New name"
            />
            <div class="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" @click="showRenameModal = false">Cancel</Button>
              <Button type="submit" size="sm" :disabled="renameSaving">
                {{ renameSaving ? 'Saving...' : 'Rename' }}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </LayoutPageContainer>
</template>
