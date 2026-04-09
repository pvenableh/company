<script setup lang="ts">
import type { ProjectEventFile } from '~~/types/projects';
import type { File as DirectusFile } from '~~/types/system';

const props = defineProps<{
  files: (Omit<ProjectEventFile, 'directus_files_id'> & { directus_files_id: DirectusFile })[];
}>();

const config = useRuntimeConfig();

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return 'i-heroicons-photo';
  if (type.startsWith('video/')) return 'i-heroicons-video-camera';
  if (type.includes('pdf')) return 'i-heroicons-document-text';
  if (type.includes('spreadsheet') || type.includes('excel')) return 'i-heroicons-table-cells';
  return 'i-heroicons-document';
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
</script>

<template>
  <div class="space-y-2">
    <h4 class="text-xs font-bold uppercase tracking-wider text-gray-500">
      Files ({{ files.length }})
    </h4>

    <div class="space-y-1">
      <a
        v-for="file in files"
        :key="file.id"
        :href="`${config.public.directusUrl}/assets/${file.directus_files_id.id}`"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
      >
        <Icon
          :name="getFileIcon(file.directus_files_id.type)"
          class="h-4 w-4 text-gray-400 group-hover:text-gray-600"
        />
        <div class="flex-1 min-w-0">
          <p class="text-xs truncate text-gray-700 dark:text-gray-300">
            {{ file.directus_files_id.filename_download }}
          </p>
          <p class="text-[9px] text-gray-400">
            {{ formatFileSize(file.directus_files_id.filesize) }}
          </p>
        </div>
        <Icon
          name="i-heroicons-arrow-down-tray"
          class="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </a>
    </div>
  </div>
</template>
