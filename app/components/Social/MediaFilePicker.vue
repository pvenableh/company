<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      @click.self="$emit('close')"
    >
      <div class="bg-background rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <div>
            <h3 class="font-semibold text-sm">Choose Media</h3>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              Click to select multiple — pick 2+ to post as a carousel
            </p>
          </div>
          <button class="text-muted-foreground hover:text-foreground" @click="$emit('close')">
            <Icon name="lucide:x" class="w-4 h-4" />
          </button>
        </div>

        <!-- Breadcrumbs + Filter -->
        <div class="flex items-center justify-between gap-3 px-5 py-2.5 border-b shrink-0">
          <div class="flex items-center gap-1 text-xs overflow-x-auto min-w-0">
            <template v-for="(crumb, i) in breadcrumbs" :key="i">
              <button
                v-if="i < breadcrumbs.length - 1"
                class="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                @click="navigateToBreadcrumb(i)"
              >
                {{ crumb.name }}
              </button>
              <span v-else class="font-medium shrink-0">{{ crumb.name }}</span>
              <Icon
                v-if="i < breadcrumbs.length - 1"
                name="lucide:chevron-right"
                class="w-3 h-3 text-muted-foreground/50 shrink-0"
              />
            </template>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <input
              v-model="search"
              type="search"
              placeholder="Filter..."
              class="w-32 rounded-full border bg-background px-2 py-1 text-xs"
            />
            <label
              class="flex items-center gap-1 px-2 py-1 rounded-md border text-xs text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
            >
              <Icon name="lucide:upload" class="w-3.5 h-3.5" />
              <span>{{ uploading ? 'Uploading…' : 'Upload' }}</span>
              <input
                ref="fileInputRef"
                type="file"
                accept="image/*,video/*"
                multiple
                class="hidden"
                :disabled="uploading"
                @change="handleUpload"
              />
            </label>
          </div>
        </div>

        <!-- Content -->
        <div
          class="flex-1 overflow-y-auto min-h-0 p-4 relative"
          @dragover.prevent="isDragOver = true"
          @dragleave="isDragOver = false"
          @drop.prevent="handleDrop"
        >
          <div
            v-if="isDragOver"
            class="absolute inset-0 z-10 bg-primary/5 border-2 border-dashed border-primary/30 rounded-lg flex items-center justify-center pointer-events-none"
          >
            <div class="text-center">
              <Icon name="lucide:upload-cloud" class="w-10 h-10 text-primary mx-auto mb-2" />
              <p class="text-sm font-medium">Drop files here</p>
            </div>
          </div>

          <div v-if="loading" class="flex items-center justify-center py-16">
            <Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
          </div>

          <div v-else-if="!filteredFolders.length && !filteredFiles.length && !search" class="flex flex-col items-center justify-center py-16 gap-3">
            <Icon name="lucide:image" class="w-12 h-12 text-muted-foreground/20" />
            <p class="text-sm text-muted-foreground">No media in this folder</p>
            <label class="cursor-pointer">
              <span class="text-xs text-primary hover:underline">Upload media to get started</span>
              <input type="file" accept="image/*,video/*" multiple class="hidden" @change="handleUpload" />
            </label>
          </div>

          <div v-else-if="!filteredFolders.length && !filteredFiles.length && search" class="flex flex-col items-center justify-center py-16 gap-2">
            <Icon name="lucide:search-x" class="w-8 h-8 text-muted-foreground/30" />
            <p class="text-xs text-muted-foreground">No results for "{{ search }}"</p>
          </div>

          <template v-else>
            <div v-if="filteredFolders.length" class="mb-4">
              <h4 class="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Folders</h4>
              <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
                <button
                  v-for="folder in filteredFolders"
                  :key="folder.id"
                  class="flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-muted/40 transition-colors text-left"
                  @click="navigateToFolder(folder.id, folder.name)"
                >
                  <Icon name="lucide:folder" class="w-4 h-4 text-warning shrink-0" />
                  <span class="text-xs font-medium truncate">{{ folder.name }}</span>
                </button>
              </div>
            </div>

            <div v-if="filteredFiles.length">
              <h4 class="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Media</h4>
              <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                <button
                  v-for="file in filteredFiles"
                  :key="file.id"
                  class="group relative aspect-square rounded-md overflow-hidden border transition-all"
                  :class="isSelected(file.id) ? 'ring-2 ring-primary' : 'hover:ring-2 hover:ring-primary/50'"
                  @click="toggleSelect(file)"
                >
                  <img
                    v-if="isImage(file)"
                    :src="getThumbnailUrl(file.id)"
                    :alt="file.title || file.filename_download"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div v-else class="w-full h-full bg-muted flex flex-col items-center justify-center gap-1">
                    <Icon name="lucide:video" class="w-7 h-7 text-muted-foreground/60" />
                    <span class="text-[9px] text-muted-foreground/80 px-2 truncate max-w-full">
                      {{ file.filename_download }}
                    </span>
                  </div>

                  <!-- Always-visible checkbox affordance: empty when unselected,
                       filled when selected. Position numbered when 2+ are picked
                       so users see carousel order. -->
                  <div
                    class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all"
                    :class="isSelected(file.id)
                      ? 'bg-primary text-primary-foreground shadow ring-2 ring-white'
                      : 'bg-white/80 text-transparent ring-1 ring-gray-300 group-hover:ring-primary/60 backdrop-blur-sm'"
                  >
                    <span v-if="isSelected(file.id) && selected.length > 1">
                      {{ selected.findIndex((s) => s.id === file.id) + 1 }}
                    </span>
                    <Icon v-else-if="isSelected(file.id)" name="lucide:check" class="w-3.5 h-3.5" />
                  </div>

                  <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p class="text-[10px] text-white truncate">{{ file.title || file.filename_download }}</p>
                  </div>
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between px-5 py-3 border-t shrink-0">
          <span class="text-xs text-muted-foreground">
            <template v-if="selected.length === 0">Nothing selected</template>
            <template v-else-if="selected.length === 1">1 selected</template>
            <template v-else>
              {{ selected.length }} selected — will post as a carousel
            </template>
          </span>
          <div class="flex gap-2">
            <UButton variant="ghost" size="sm" @click="$emit('close')">Cancel</UButton>
            <UButton
              size="sm"
              :disabled="selected.length === 0"
              icon="i-lucide-check"
              @click="confirmPick"
            >
              Add {{ selected.length || '' }}
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  picked: [files: { url: string; type: 'image' | 'video' }[]];
  close: [];
}>();

const config = useRuntimeConfig();
const { list: listFiles, upload: uploadFile } = useDirectusFiles();
const { getChildren: getSubfolders, get: getFolder } = useFolders();
const { getOrgFolderId } = useOrgFolders();

const orgFolderId = getOrgFolderId();

const currentFolderId = ref<string | null>(orgFolderId);
const breadcrumbs = ref<{ id: string; name: string }[]>([]);
const folders = ref<any[]>([]);
const files = ref<any[]>([]);
const loading = ref(true);
const search = ref('');
const uploading = ref(false);
const isDragOver = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const selected = ref<any[]>([]);

const filteredFolders = computed(() => {
  if (!search.value) return folders.value;
  const q = search.value.toLowerCase();
  return folders.value.filter((f: any) => f.name?.toLowerCase().includes(q));
});

const filteredFiles = computed(() => {
  if (!search.value) return files.value;
  const q = search.value.toLowerCase();
  return files.value.filter((f: any) =>
    (f.title || f.filename_download || '').toLowerCase().includes(q),
  );
});

function isImage(file: any): boolean {
  return (file.type || '').startsWith('image/');
}

function isSelected(id: string): boolean {
  return selected.value.some((f) => f.id === id);
}

function toggleSelect(file: any) {
  const idx = selected.value.findIndex((f) => f.id === file.id);
  if (idx === -1) selected.value.push(file);
  else selected.value.splice(idx, 1);
}

function confirmPick() {
  const out = selected.value.map((f) => ({
    url: `${config.public.directusUrl}/assets/${f.id}`,
    type: (isImage(f) ? 'image' : 'video') as 'image' | 'video',
  }));
  emit('picked', out);
}

function getThumbnailUrl(fileId: string): string {
  return `${config.public.directusUrl}/assets/${fileId}?width=200&height=200&fit=cover&quality=80`;
}

async function fetchContents() {
  if (!currentFolderId.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const [folderData, fileData] = await Promise.all([
      getSubfolders(currentFolderId.value),
      listFiles({
        filter: {
          folder: { _eq: currentFolderId.value },
          _or: [
            { type: { _starts_with: 'image/' } },
            { type: { _starts_with: 'video/' } },
          ],
        },
        fields: ['id', 'title', 'filename_download', 'type', 'filesize'],
        sort: ['-uploaded_on'],
        limit: 200,
      }),
    ]);
    folders.value = folderData || [];
    files.value = (fileData as any[]) || [];
  } catch (err) {
    console.error('Failed to fetch folder contents:', err);
  } finally {
    loading.value = false;
  }
}

async function navigateToFolder(folderId: string, folderName: string) {
  currentFolderId.value = folderId;
  breadcrumbs.value.push({ id: folderId, name: folderName });
  await fetchContents();
}

function navigateToBreadcrumb(index: number) {
  const crumb = breadcrumbs.value[index];
  if (!crumb) return;
  currentFolderId.value = crumb.id;
  breadcrumbs.value = breadcrumbs.value.slice(0, index + 1);
  fetchContents();
}

async function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const list = input.files;
  if (!list?.length) return;
  await uploadFiles(list);
  input.value = '';
}

async function handleDrop(event: DragEvent) {
  isDragOver.value = false;
  const list = event.dataTransfer?.files;
  if (!list?.length) return;
  await uploadFiles(list);
}

async function uploadFiles(list: FileList) {
  if (!currentFolderId.value) return;
  uploading.value = true;
  try {
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!;
      if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) continue;
      await uploadFile(f, { folder: currentFolderId.value });
    }
    await fetchContents();
  } catch (err) {
    console.error('Upload failed:', err);
  } finally {
    uploading.value = false;
  }
}

onMounted(async () => {
  if (!orgFolderId) {
    breadcrumbs.value = [{ id: '', name: 'No org folder' }];
    loading.value = false;
    return;
  }
  try {
    const rootFolder = await getFolder(orgFolderId);
    breadcrumbs.value = [{ id: orgFolderId, name: rootFolder?.name || 'Organization' }];
  } catch {
    breadcrumbs.value = [{ id: orgFolderId, name: 'Organization' }];
  }
  await fetchContents();
});
</script>
