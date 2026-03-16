<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      @click.self="$emit('close')"
    >
      <div class="bg-background rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h3 class="font-semibold text-sm">Select Image</h3>
          <button class="text-muted-foreground hover:text-foreground" @click="$emit('close')">
            <Icon name="lucide:x" class="w-4 h-4" />
          </button>
        </div>

        <!-- Breadcrumbs + Actions bar -->
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
              class="w-32 rounded-md border bg-background px-2 py-1 text-xs"
            />
            <label
              class="flex items-center gap-1 px-2 py-1 rounded-md border text-xs text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
            >
              <Icon name="lucide:upload" class="w-3.5 h-3.5" />
              <span>{{ uploading ? 'Uploading...' : 'Upload' }}</span>
              <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
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
          class="flex-1 overflow-y-auto min-h-0 p-4"
          @dragover.prevent="isDragOver = true"
          @dragleave="isDragOver = false"
          @drop.prevent="handleDrop"
        >
          <!-- Drag overlay -->
          <div
            v-if="isDragOver"
            class="absolute inset-0 z-10 bg-primary/5 border-2 border-dashed border-primary/30 rounded-lg flex items-center justify-center pointer-events-none"
          >
            <div class="text-center">
              <Icon name="lucide:upload-cloud" class="w-10 h-10 text-primary mx-auto mb-2" />
              <p class="text-sm font-medium">Drop images here</p>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="loading" class="flex items-center justify-center py-16">
            <Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
          </div>

          <!-- Empty -->
          <div v-else-if="!filteredFolders.length && !filteredImages.length && !search" class="flex flex-col items-center justify-center py-16 gap-3">
            <Icon name="lucide:image" class="w-12 h-12 text-muted-foreground/20" />
            <p class="text-sm text-muted-foreground">No images in this folder</p>
            <label class="cursor-pointer">
              <span class="text-xs text-primary hover:underline">Upload images to get started</span>
              <input type="file" accept="image/*" multiple class="hidden" @change="handleUpload" />
            </label>
          </div>

          <!-- No search results -->
          <div v-else-if="!filteredFolders.length && !filteredImages.length && search" class="flex flex-col items-center justify-center py-16 gap-2">
            <Icon name="lucide:search-x" class="w-8 h-8 text-muted-foreground/30" />
            <p class="text-xs text-muted-foreground">No results for "{{ search }}"</p>
          </div>

          <template v-else>
            <!-- Folders -->
            <div v-if="filteredFolders.length" class="mb-4">
              <h4 class="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Folders</h4>
              <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
                <button
                  v-for="folder in filteredFolders"
                  :key="folder.id"
                  class="flex items-center gap-2 px-3 py-2 rounded-md border hover:bg-muted/40 transition-colors text-left"
                  @click="navigateToFolder(folder.id, folder.name)"
                >
                  <Icon name="lucide:folder" class="w-4 h-4 text-amber-400 shrink-0" />
                  <span class="text-xs font-medium truncate">{{ folder.name }}</span>
                </button>
              </div>
            </div>

            <!-- Images grid -->
            <div v-if="filteredImages.length">
              <h4 class="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Images</h4>
              <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                <button
                  v-for="file in filteredImages"
                  :key="file.id"
                  class="group relative aspect-square rounded-md overflow-hidden border hover:ring-2 hover:ring-primary transition-all"
                  @click="selectImage(file)"
                >
                  <img
                    :src="getThumbnailUrl(file.id)"
                    :alt="file.title || file.filename_download"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <Icon
                      name="lucide:check-circle"
                      class="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg"
                    />
                  </div>
                  <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p class="text-[10px] text-white truncate">{{ file.title || file.filename_download }}</p>
                  </div>
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{
  orgFolderId: string;
}>();

const emit = defineEmits<{
  select: [url: string];
  close: [];
}>();

const config = useRuntimeConfig();
const { list: listFiles, upload: uploadFile } = useDirectusFiles();
const { getChildren: getSubfolders, get: getFolder } = useFolders();

// State
const currentFolderId = ref<string>(props.orgFolderId);
const breadcrumbs = ref<{ id: string; name: string }[]>([]);
const folders = ref<any[]>([]);
const images = ref<any[]>([]);
const loading = ref(true);
const search = ref('');
const uploading = ref(false);
const isDragOver = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

// Filtered items
const filteredFolders = computed(() => {
  if (!search.value) return folders.value;
  const q = search.value.toLowerCase();
  return folders.value.filter((f: any) => f.name?.toLowerCase().includes(q));
});

const filteredImages = computed(() => {
  if (!search.value) return images.value;
  const q = search.value.toLowerCase();
  return images.value.filter((f: any) =>
    (f.title || f.filename_download || '').toLowerCase().includes(q),
  );
});

// Fetch contents of current folder (images only, not all file types)
async function fetchContents() {
  loading.value = true;
  try {
    const [folderData, fileData] = await Promise.all([
      getSubfolders(currentFolderId.value),
      listFiles({
        filter: {
          folder: { _eq: currentFolderId.value },
          type: { _starts_with: 'image/' },
        },
        fields: ['id', 'title', 'filename_download', 'type', 'filesize'],
        sort: ['-uploaded_on'],
        limit: 200,
      }),
    ]);
    folders.value = folderData || [];
    images.value = (fileData as any[]) || [];
  } catch (err) {
    console.error('Failed to fetch folder contents:', err);
  } finally {
    loading.value = false;
  }
}

// Navigation — constrained to org folder tree
async function navigateToFolder(folderId: string, folderName: string) {
  currentFolderId.value = folderId;
  breadcrumbs.value.push({ id: folderId, name: folderName });
  await fetchContents();
}

function navigateToBreadcrumb(index: number) {
  const crumb = breadcrumbs.value[index];
  currentFolderId.value = crumb.id;
  breadcrumbs.value = breadcrumbs.value.slice(0, index + 1);
  fetchContents();
}

// Image selection
function selectImage(file: any) {
  const url = `${config.public.directusUrl}/assets/${file.id}`;
  emit('select', url);
}

function getThumbnailUrl(fileId: string): string {
  return `${config.public.directusUrl}/assets/${fileId}?width=200&height=200&fit=cover&quality=80`;
}

// Upload
async function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files?.length) return;
  await uploadFiles(files);
  input.value = '';
}

async function handleDrop(event: DragEvent) {
  isDragOver.value = false;
  const files = event.dataTransfer?.files;
  if (!files?.length) return;
  await uploadFiles(files);
}

async function uploadFiles(files: FileList) {
  uploading.value = true;
  try {
    for (let i = 0; i < files.length; i++) {
      if (!files[i].type.startsWith('image/')) continue;
      await uploadFile(files[i], {
        folder: currentFolderId.value,
      });
    }
    await fetchContents();
  } catch (err) {
    console.error('Upload failed:', err);
  } finally {
    uploading.value = false;
  }
}

// Init — load root org folder name + contents
onMounted(async () => {
  try {
    const rootFolder = await getFolder(props.orgFolderId);
    breadcrumbs.value = [{ id: props.orgFolderId, name: rootFolder?.name || 'Organization' }];
  } catch {
    breadcrumbs.value = [{ id: props.orgFolderId, name: 'Organization' }];
  }
  await fetchContents();
});
</script>
