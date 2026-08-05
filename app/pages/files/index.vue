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
// View preference is remembered per user, per device (localStorage — same
// convention as useDashboardLayout). Defaults to 'list' until a saved choice
// is restored on mount.
const { user } = useUserSession();
const viewModeKey = computed(() => `earnest:files:view:${(user.value as any)?.id || 'anon'}`);
const viewMode = ref<'grid' | 'list'>('list');
const uploading = ref(false);
const uploadProgress = ref(0);
const uploadError = ref<string | null>(null);

// ── Storage usage meter ──────────────────────────────────────────────────────
const { selectedOrg } = useOrganization();
const storage = ref<{ usedBytes: number; limitBytes: number | null } | null>(null);

async function loadStorage(recompute = false) {
  if (!selectedOrg.value) return;
  try {
    storage.value = await $fetch(`/api/org/${selectedOrg.value}/storage`, {
      query: recompute ? { recompute: 1 } : undefined,
    });
  } catch { /* meter is non-critical */ }
}

// Instantly adjust the cached counter (e.g. on delete) without the slow recompute.
async function adjustStorage(deltaBytes: number) {
  if (!selectedOrg.value || !deltaBytes) return;
  try {
    storage.value = await $fetch(`/api/org/${selectedOrg.value}/storage/adjust`, {
      method: 'POST',
      body: { deltaBytes },
    });
  } catch { /* meter is non-critical */ }
}

const storagePct = computed(() => {
  const s = storage.value;
  if (!s || s.limitBytes == null || s.limitBytes <= 0) return 0;
  return Math.min(100, Math.round((s.usedBytes / s.limitBytes) * 100));
});

// ── Modals ───────────────────────────────────────────────────────────────────
const showNewFolder = ref(false);
const newFolderName = ref('');
const creatingFolder = ref(false);
const showRenameModal = ref(false);
const renameTarget = ref<{ id: string; name: string; type: 'folder' | 'file' } | null>(null);
const renameName = ref('');
const renameSaving = ref(false);
const deleteFolderTarget = ref<any | null>(null);
const deletingFolder = ref(false);
const optimizeTarget = ref<any | null>(null);
const optimizing = ref(false);
const optimizeResult = ref<{ optimized: boolean; before: number; after: number; type: string } | null>(null);

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
  if (type.includes('pdf')) return 'text-destructive';
  if (type.includes('spreadsheet') || type.includes('excel')) return 'text-success';
  if (type.includes('document') || type.includes('word')) return 'text-blue-500';
  return 'text-muted-foreground';
}

function isImage(type: string): boolean {
  return type?.startsWith('image/') || false;
}

// Raster formats the optimizer can re-encode (mirrors server image-optimize.ts).
function isOptimizable(type: string): boolean {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/avif'].includes((type || '').toLowerCase());
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

// Force-download via Directus's ?download (sets Content-Disposition: attachment).
function downloadFile(file: any) {
  const a = document.createElement('a');
  a.href = `${config.public.directusUrl}/assets/${file.id}?download`;
  a.download = file.filename_download || getFileName(file);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Download several files (sequential clicks — no client-side zip dependency).
async function downloadFiles(items: any[]) {
  for (const f of items) {
    downloadFile(f);
    await new Promise((r) => setTimeout(r, 250)); // let each download register
  }
}

// Per-file optimize: opens a dialog where the user picks email-safe (default) or
// WebP (smaller, opt-in with an email warning).
function handleOptimizeFile(file: any) {
  optimizeTarget.value = file;
  optimizeResult.value = null;
}

async function confirmOptimize(format: 'auto' | 'webp') {
  const file = optimizeTarget.value;
  if (!file) return;
  optimizing.value = true;
  try {
    optimizeResult.value = await $fetch('/api/directus/files/optimize', {
      method: 'POST',
      body: { organization: selectedOrg.value, fileId: file.id, format },
    });
    bump.value++;
    await fetchContents();
    await loadStorage(false);
  } catch (err: any) {
    uploadError.value = err?.data?.message || 'Could not optimize that file.';
    optimizeTarget.value = null;
  } finally {
    optimizing.value = false;
  }
}

// ── Library optimize sweep (email-safe, batched) ─────────────────────────────
const sweepOpen = ref(false);
const sweeping = ref(false);
const sweepFinished = ref(false);
const sweepProcessed = ref(0);
const sweepReclaimed = ref(0);

function openSweep() {
  sweepOpen.value = true;
  sweeping.value = false;
  sweepFinished.value = false;
  sweepProcessed.value = 0;
  sweepReclaimed.value = 0;
}

async function runSweep() {
  if (!selectedOrg.value || sweeping.value) return;
  sweeping.value = true;
  sweepFinished.value = false;
  sweepProcessed.value = 0;
  sweepReclaimed.value = 0;
  try {
    let done = false;
    let offset = 0;
    let guard = 0;
    while (!done && guard++ < 2000) {
      const r = await $fetch<{ processed: number; reclaimedBytes: number; nextOffset: number; done: boolean }>(
        '/api/directus/files/optimize-sweep',
        { method: 'POST', body: { organization: selectedOrg.value, offset, limit: 5 } },
      );
      sweepProcessed.value += r.processed;
      sweepReclaimed.value += r.reclaimedBytes;
      offset = r.nextOffset;
      done = r.done;
      if (r.processed === 0) break;
    }
    sweepFinished.value = true;
    bump.value++;
    await fetchContents();
    await loadStorage(false);
  } catch (err: any) {
    uploadError.value = err?.data?.message || 'Could not optimize the library.';
    sweepOpen.value = false;
  } finally {
    sweeping.value = false;
  }
}

// Copy a shareable link to the file (the Directus asset URL — an unguessable
// UUID, publicly viewable, so it just works when pasted to a client).
const copiedFileId = ref<string | null>(null);
async function copyFileLink(file: any) {
  const url = `${config.public.directusUrl}/assets/${file.id}`;
  try {
    await navigator.clipboard.writeText(url);
    copiedFileId.value = file.id;
    setTimeout(() => { if (copiedFileId.value === file.id) copiedFileId.value = null; }, 1600);
  } catch { /* clipboard denied */ }
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
  uploadError.value = null;

  try {
    const total = uploadFiles.length;
    for (let i = 0; i < total; i++) {
      await uploadFile(uploadFiles[i], {
        folder: currentFolderId.value || undefined,
        organization: selectedOrg.value || undefined,
      });
      uploadProgress.value = Math.round(((i + 1) / total) * 100);
    }
    await fetchContents();
    await loadStorage(false);
  } catch (err: any) {
    uploadError.value = err?.data?.message || err?.message || 'Upload failed.';
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
  uploadError.value = null;

  try {
    const total = droppedFiles.length;
    for (let i = 0; i < total; i++) {
      await uploadFile(droppedFiles[i], {
        folder: currentFolderId.value || undefined,
        organization: selectedOrg.value || undefined,
      });
      uploadProgress.value = Math.round(((i + 1) / total) * 100);
    }
    await fetchContents();
    await loadStorage(false);
  } catch (err: any) {
    uploadError.value = err?.data?.message || err?.message || 'Upload failed.';
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
    await adjustStorage(-(Number(file.filesize) || 0)); // free the deleted bytes instantly
    await fetchContents();
  } catch (err) {
    console.error('Failed to delete file:', err);
  }
}

// Opens the delete-folder dialog so the user authorizes what happens to contents.
function handleDeleteFolder(folder: any) {
  deleteFolderTarget.value = folder;
}

async function confirmDeleteFolder(mode: 'contents' | 'keep') {
  const folder = deleteFolderTarget.value;
  if (!folder) return;
  deletingFolder.value = true;
  try {
    await $fetch('/api/directus/folders/delete-recursive', {
      method: 'POST',
      body: { organization: selectedOrg.value, folderId: folder.id, mode },
    });
    deleteFolderTarget.value = null;
    bump.value++;
    await fetchContents();
    await loadStorage(false);
  } catch (err: any) {
    uploadError.value = err?.data?.message || 'Could not delete that folder.';
  } finally {
    deletingFolder.value = false;
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

// ── Selection + drag/move (list view via FilesListNode) ──────────────────────
import type { FilesContext } from '~/components/Files/context';

const selectedMap = reactive(new Map<string, { kind: 'file' | 'folder'; item: any }>());
const selectedCount = computed(() => selectedMap.size);
const bump = ref(0);
const crumbDropIndex = ref<number | null>(null);
const upDropActive = ref(false);
const parentFolderId = computed(() => {
  const bc = breadcrumbs.value;
  return bc.length > 1 ? bc[bc.length - 2].id : null;
});

function toggleSelect(kind: 'file' | 'folder', item: any) {
  if (selectedMap.has(item.id)) selectedMap.delete(item.id);
  else selectedMap.set(item.id, { kind, item });
}
function clearSelection() { selectedMap.clear(); }

async function moveItem(kind: 'file' | 'folder', id: string, targetFolderId: string | null) {
  try {
    await $fetch('/api/directus/folders/move', {
      method: 'POST',
      body: { organization: selectedOrg.value, kind, id, targetFolderId },
    });
    bump.value++;
    await fetchContents();
  } catch (err: any) {
    uploadError.value = err?.data?.message || 'Could not move that item.';
  }
}

async function folderSize(folderId: string): Promise<number> {
  try {
    const r = await $fetch<{ bytes: number }>('/api/directus/folders/size', {
      method: 'POST', body: { organization: selectedOrg.value, folderId },
    });
    return r?.bytes || 0;
  } catch { return 0; }
}

async function downloadSelected() {
  await downloadFiles([...selectedMap.values()].filter((x) => x.kind === 'file').map((x) => x.item));
}

async function deleteSelected() {
  const items = [...selectedMap.values()];
  if (!items.length) return;
  if (!confirm(`Delete ${items.length} selected item(s)? Folders delete everything inside. This can't be undone.`)) return;
  for (const { kind, item } of items) {
    try {
      if (kind === 'folder') {
        await $fetch('/api/directus/folders/delete-recursive', {
          method: 'POST', body: { organization: selectedOrg.value, folderId: item.id },
        });
      } else {
        await removeFile(item.id);
        await adjustStorage(-(Number(item.filesize) || 0));
      }
    } catch (err) { console.error('bulk delete failed for', item.id, err); }
  }
  clearSelection();
  bump.value++;
  await fetchContents();
  await loadStorage(false);
}

// Fetchers used by the recursive list nodes (lazy children).
function fetchChildFolders(parentId: string | null) { return getSubfolders(parentId); }
async function fetchChildFiles(folderId: string | null) {
  return (await listFiles({
    filter: folderId ? { folder: { _eq: folderId } } : { folder: { _null: true } },
    fields: ['id', 'title', 'filename_download', 'type', 'filesize', 'width', 'height', 'uploaded_on', 'modified_on'],
    sort: ['-uploaded_on'],
    limit: 200,
  })) as any[];
}

provide<FilesContext>('filesCtx', {
  organization: computed(() => (selectedOrg.value as string) || null),
  selected: selectedMap,
  bump,
  toggleSelect,
  openFile,
  openFolder: (folder) => navigateToFolder(folder.id, folder.name),
  download: downloadFile,
  copyLink: copyFileLink,
  copiedId: copiedFileId,
  optimize: handleOptimizeFile,
  isOptimizable,
  rename: (item, kind) => startRename(item, kind),
  remove: (item, kind) => (kind === 'folder' ? handleDeleteFolder(item) : handleDeleteFile(item)),
  move: moveItem,
  fetchFolders: fetchChildFolders,
  fetchFiles: fetchChildFiles,
  folderSize,
  isImage,
  thumbUrl: getThumbnailUrl,
  fileIcon: getFileIcon,
  fileIconColor: getFileIconColor,
  fileName: getFileName,
  formatSize: formatFileSize,
  formatDate,
});

// Drop onto a breadcrumb / up target → move selection or dragged item there.
function onCrumbDrop(e: DragEvent, targetFolderId: string | null) {
  e.preventDefault();
  const raw = e.dataTransfer?.getData('application/x-earnest-item');
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    moveItem(d.kind, d.id, targetFolderId);
  } catch { /* ignore */ }
}

// ── Init ─────────────────────────────────────────────────────────────────────
onMounted(async () => {
  // Restore this user's saved view choice (grid/list); default stays 'list'.
  const saved = localStorage.getItem(viewModeKey.value);
  if (saved === 'grid' || saved === 'list') viewMode.value = saved;

  // Default to the current org's folder tree
  const orgFolderId = getOrgFolderId();
  if (orgFolderId) {
    currentFolderId.value = orgFolderId;
    const { currentOrg } = useOrganization();
    breadcrumbs.value = [{ id: orgFolderId, name: currentOrg.value?.name || 'Files' }];
  }
  await fetchContents();
  await loadStorage();
});

// Refresh the storage meter when the active org changes.
watch(selectedOrg, () => loadStorage());

// Persist the choice whenever it changes.
watch(viewMode, (v) => {
  if (import.meta.client) localStorage.setItem(viewModeKey.value, v);
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
      <div class="flex items-center gap-3">
        <!-- Storage meter -->
        <div v-if="storage && storage.limitBytes != null" class="hidden sm:flex flex-col items-end gap-1">
          <span class="text-xs text-muted-foreground">
            {{ formatFileSize(storage.usedBytes) || '0 B' }} of {{ formatFileSize(storage.limitBytes) }}
          </span>
          <div class="h-1.5 w-32 rounded-full bg-muted overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="storagePct >= 90 ? 'bg-destructive' : storagePct >= 75 ? 'bg-amber-500' : 'bg-primary'"
              :style="{ width: Math.max(2, storagePct) + '%' }"
            />
          </div>
        </div>
        <Button variant="outline" size="sm" title="Optimize all images to reclaim space" @click="openSweep">
          <Icon name="lucide:wand-sparkles" class="w-4 h-4 sm:mr-1" />
          <span class="hidden sm:inline">Optimize</span>
        </Button>
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

    <!-- Upload error (too large / storage full) -->
    <div
      v-if="uploadError"
      class="mb-4 flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3"
    >
      <div class="flex items-start gap-2">
        <Icon name="lucide:alert-triangle" class="w-4 h-4 mt-0.5 text-destructive shrink-0" />
        <p class="text-sm text-foreground">{{ uploadError }}</p>
      </div>
      <button class="text-muted-foreground hover:text-foreground shrink-0" @click="uploadError = null">
        <Icon name="lucide:x" class="w-4 h-4" />
      </button>
    </div>

    <!-- Breadcrumbs -->
    <div class="flex items-center gap-1 mb-4 text-sm overflow-x-auto">
      <template v-for="(crumb, i) in breadcrumbs" :key="i">
        <button
          v-if="i < breadcrumbs.length - 1"
          class="text-muted-foreground hover:text-foreground transition-colors shrink-0 rounded-md px-1.5 py-0.5 data-[drop=on]:bg-primary/10 data-[drop=on]:text-foreground"
          :data-drop="crumbDropIndex === i ? 'on' : 'off'"
          @click="navigateToBreadcrumb(i)"
          @dragover.prevent="crumbDropIndex = i"
          @dragleave="crumbDropIndex = null"
          @drop="crumbDropIndex = null; onCrumbDrop($event, crumb.id)"
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
        class="flex-1 min-w-48 rounded-full glass-field px-3 py-2 text-sm"
      />
      <div class="inline-flex items-center gap-0.5 p-0.5 bg-muted/40 rounded-full text-[12px] font-medium">
        <button
          type="button"
          aria-label="Grid view"
          :aria-pressed="viewMode === 'grid'"
          class="inline-flex items-center px-2.5 py-1 rounded-full transition-colors"
          :class="viewMode === 'grid' ? 'glass-active-thumb relative text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="viewMode = 'grid'"
        >
          <Icon name="lucide:layout-grid" class="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="List view"
          :aria-pressed="viewMode === 'list'"
          class="inline-flex items-center px-2.5 py-1 rounded-full transition-colors"
          :class="viewMode === 'list' ? 'glass-active-thumb relative text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="viewMode = 'list'"
        >
          <Icon name="lucide:list" class="w-3.5 h-3.5" />
        </button>
      </div>
      <span
        v-if="breadcrumbs.length > 1"
        class="inline-flex rounded-full transition-colors"
        :class="upDropActive ? 'ring-2 ring-primary/50' : ''"
        @dragover.prevent="upDropActive = true"
        @dragleave="upDropActive = false"
        @drop="upDropActive = false; onCrumbDrop($event, parentFolderId)"
      >
        <UiActionButton
          circle
          icon="lucide:arrow-up"
          title="Up one level (or drop here to move up)"
          hide-label="always"
          @click="navigateUp"
        />
      </span>
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

    <!-- Selection toolbar -->
    <div
      v-if="selectedCount > 0"
      class="mb-4 flex items-center justify-between gap-3 rounded-full border border-border bg-muted/40 px-4 py-2"
    >
      <span class="text-sm font-medium">{{ selectedCount }} selected</span>
      <div class="flex items-center gap-1">
        <button class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors" @click="downloadSelected">
          <Icon name="lucide:download" class="w-3.5 h-3.5" /> Download
        </button>
        <button class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors" @click="deleteSelected">
          <Icon name="lucide:trash-2" class="w-3.5 h-3.5" /> Delete
        </button>
        <button class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors" @click="clearSelection">
          Clear
        </button>
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
              <Icon name="lucide:folder" class="w-8 h-8 text-warning" />
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
                    class="p-0.5 transition-colors"
                    :class="copiedFileId === file.id ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground'"
                    :title="copiedFileId === file.id ? 'Link copied' : 'Copy link'"
                    @click.stop="copyFileLink(file)"
                  >
                    <Icon :name="copiedFileId === file.id ? 'lucide:check' : 'lucide:link'" class="w-3 h-3" />
                  </button>
                  <button
                    v-if="isOptimizable(file.type)"
                    class="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    title="Optimize"
                    @click.stop="handleOptimizeFile(file)"
                  >
                    <Icon name="lucide:wand-sparkles" class="w-3 h-3" />
                  </button>
                  <button
                    class="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    title="Download"
                    @click.stop="downloadFile(file)"
                  >
                    <Icon name="lucide:download" class="w-3 h-3" />
                  </button>
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
      <div class="hidden md:grid grid-cols-[1fr_120px_120px_96px] gap-4 pr-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border/40 mb-1">
        <span class="pl-[52px]">Name</span>
        <span>Size</span>
        <span>Modified</span>
        <span></span>
      </div>

      <!-- Recursive rows: expand-in-list, drag-to-move, multi-select, folder size -->
      <FilesListNode v-for="folder in filteredFolders" :key="'f' + folder.id" :item="folder" kind="folder" :depth="0" />
      <FilesListNode v-for="file in filteredFiles" :key="'x' + file.id" :item="file" kind="file" :depth="0" />
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
              class="w-full rounded-md glass-field px-3 py-2 text-sm mb-4"
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
              class="w-full rounded-md glass-field px-3 py-2 text-sm mb-4"
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

    <!-- Delete Folder Modal — the user authorizes what happens to the contents -->
    <Teleport to="body">
      <div
        v-if="deleteFolderTarget"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="deleteFolderTarget = null"
      >
        <div class="ios-card shadow-xl w-full max-w-md mx-4 p-6">
          <h2 class="font-semibold mb-1">Delete "{{ deleteFolderTarget.name }}"</h2>
          <p class="text-sm text-muted-foreground mb-5">What should happen to the files and folders inside?</p>
          <div class="flex flex-col gap-2">
            <button
              class="text-left rounded-xl border border-border hover:border-primary/40 hover:bg-muted/30 px-4 py-3 transition-colors disabled:opacity-50"
              :disabled="deletingFolder"
              @click="confirmDeleteFolder('keep')"
            >
              <div class="flex items-center gap-2 text-sm font-medium">
                <Icon name="lucide:folder-input" class="w-4 h-4 text-primary" />
                Keep the files — move them to the root
              </div>
              <p class="text-xs text-muted-foreground mt-1 ml-6">Contents move to your organization's top-level Files folder; nothing is deleted.</p>
            </button>
            <button
              class="text-left rounded-xl border border-destructive/30 hover:border-destructive/60 hover:bg-destructive/10 px-4 py-3 transition-colors disabled:opacity-50"
              :disabled="deletingFolder"
              @click="confirmDeleteFolder('contents')"
            >
              <div class="flex items-center gap-2 text-sm font-medium text-destructive">
                <Icon name="lucide:trash-2" class="w-4 h-4" />
                Delete the folder and everything inside
              </div>
              <p class="text-xs text-muted-foreground mt-1 ml-6">Permanently removes the folder, its subfolders, and all files within. This can't be undone.</p>
            </button>
          </div>
          <div class="flex justify-end mt-5">
            <Button type="button" variant="outline" size="sm" :disabled="deletingFolder" @click="deleteFolderTarget = null">Cancel</Button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Optimize File Modal — email-safe default, WebP opt-in with a warning -->
    <Teleport to="body">
      <div
        v-if="optimizeTarget"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="!optimizing && (optimizeTarget = null)"
      >
        <div class="ios-card shadow-xl w-full max-w-md mx-4 p-6">
          <h2 class="font-semibold mb-1">Optimize "{{ getFileName(optimizeTarget) }}"</h2>

          <template v-if="!optimizeResult">
            <p class="text-sm text-muted-foreground mb-5">Shrink this image to save storage. Choose a format:</p>
            <div class="flex flex-col gap-2">
              <button
                class="text-left rounded-xl border border-border hover:border-primary/40 hover:bg-muted/30 px-4 py-3 transition-colors disabled:opacity-50"
                :disabled="optimizing"
                @click="confirmOptimize('auto')"
              >
                <div class="flex items-center gap-2 text-sm font-medium">
                  <Icon name="lucide:circle-check-big" class="w-4 h-4 text-primary" />
                  Optimize for web &amp; email
                </div>
                <p class="text-xs text-muted-foreground mt-1 ml-6">JPEG/PNG — displays everywhere, including Outlook and Gmail. Recommended.</p>
              </button>
              <button
                class="text-left rounded-xl border border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/10 px-4 py-3 transition-colors disabled:opacity-50"
                :disabled="optimizing"
                @click="confirmOptimize('webp')"
              >
                <div class="flex items-center gap-2 text-sm font-medium">
                  <Icon name="lucide:zap" class="w-4 h-4 text-amber-500" />
                  Convert to WebP (smallest)
                </div>
                <p class="text-xs text-muted-foreground mt-1 ml-6">
                  Smaller files, but <span class="font-medium text-amber-600 dark:text-amber-400">WebP doesn't display in Outlook or Gmail email</span>. Use for web only.
                </p>
              </button>
            </div>
            <div v-if="optimizing" class="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="lucide:loader-2" class="w-4 h-4 animate-spin" /> Optimizing…
            </div>
            <div class="flex justify-end mt-5">
              <Button type="button" variant="outline" size="sm" :disabled="optimizing" @click="optimizeTarget = null">Cancel</Button>
            </div>
          </template>

          <template v-else>
            <div v-if="optimizeResult.optimized" class="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 mb-4">
              <p class="text-sm font-medium">Saved {{ formatFileSize(optimizeResult.before - optimizeResult.after) }}</p>
              <p class="text-xs text-muted-foreground mt-1">
                {{ formatFileSize(optimizeResult.before) }} → {{ formatFileSize(optimizeResult.after) }}
                · now {{ optimizeResult.type.replace('image/', '').toUpperCase() }}
              </p>
            </div>
            <p v-else class="text-sm text-muted-foreground mb-4">This file is already as small as it can get — nothing changed.</p>
            <div class="flex justify-end">
              <Button type="button" size="sm" @click="optimizeTarget = null">Done</Button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- Optimize Library (sweep) Modal -->
    <Teleport to="body">
      <div
        v-if="sweepOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="!sweeping && (sweepOpen = false)"
      >
        <div class="ios-card shadow-xl w-full max-w-md mx-4 p-6">
          <h2 class="font-semibold mb-1">Optimize library</h2>

          <template v-if="!sweeping && !sweepFinished">
            <p class="text-sm text-muted-foreground mb-5">
              Re-encodes every image in your files to email-safe <span class="font-medium text-foreground">JPEG/PNG</span> to reclaim storage.
              WebP isn't used, so optimized images still display in Outlook and Gmail. Originals are replaced in place —
              existing links keep working. This can take a while for large libraries.
            </p>
            <div class="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" @click="sweepOpen = false">Cancel</Button>
              <Button type="button" size="sm" @click="runSweep">
                <Icon name="lucide:wand-sparkles" class="w-4 h-4 mr-1" /> Optimize all
              </Button>
            </div>
          </template>

          <template v-else>
            <div class="flex items-center gap-2 mb-3">
              <Icon v-if="sweeping" name="lucide:loader-2" class="w-4 h-4 animate-spin text-primary" />
              <Icon v-else name="lucide:circle-check-big" class="w-4 h-4 text-emerald-500" />
              <p class="text-sm font-medium">
                {{ sweeping ? 'Optimizing…' : 'Done' }}
              </p>
            </div>
            <div class="rounded-xl bg-muted/40 px-4 py-3 text-sm">
              <p>{{ sweepProcessed }} image{{ sweepProcessed === 1 ? '' : 's' }} processed</p>
              <p class="text-muted-foreground mt-0.5">Reclaimed {{ formatFileSize(sweepReclaimed) || '0 B' }}</p>
            </div>
            <div class="flex justify-end mt-5">
              <Button type="button" size="sm" :disabled="sweeping" @click="sweepOpen = false">
                {{ sweeping ? 'Please wait…' : 'Close' }}
              </Button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </LayoutPageContainer>
</template>
