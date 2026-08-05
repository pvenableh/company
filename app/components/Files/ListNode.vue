<script setup lang="ts">
/**
 * Recursive list row for the Files app (list view). Renders a folder (with a
 * disclosure chevron that lazily loads + nests its contents, an on-demand size,
 * drag-to-move, and drop-target behaviour) or a file (thumbnail/icon, actions,
 * drag-to-move). Multi-select, actions, and moves are handled through an
 * injected `filesCtx` so the recursion doesn't prop-drill.
 */
import type { FilesContext } from './context'

const props = defineProps<{
  item: any
  kind: 'file' | 'folder'
  depth: number
}>()

const ctx = inject<FilesContext>('filesCtx')!

const expanded = ref(false)
const loadingChildren = ref(false)
const childFolders = ref<any[]>([])
const childFiles = ref<any[]>([])
const size = ref<number | null>(null)
const sizing = ref(false)
const dragOver = ref(false)

const isSelected = computed(() => ctx.selected.has(props.item.id))
const indentStyle = computed(() => ({ paddingLeft: `${props.depth * 20 + 8}px` }))

async function loadChildren() {
  loadingChildren.value = true
  try {
    const [folders, files] = await Promise.all([ctx.fetchFolders(props.item.id), ctx.fetchFiles(props.item.id)])
    childFolders.value = folders
    childFiles.value = files
  } finally {
    loadingChildren.value = false
  }
}

async function toggleExpand() {
  expanded.value = !expanded.value
  if (expanded.value) {
    await loadChildren()
    if (size.value == null) loadSize()
  }
}

async function loadSize() {
  sizing.value = true
  try { size.value = await ctx.folderSize(props.item.id) }
  finally { sizing.value = false }
}

// Refetch children when the tree is invalidated (after a move/delete elsewhere).
watch(() => ctx.bump.value, () => { if (expanded.value) loadChildren() })

// ── Drag and drop ────────────────────────────────────────────────────────────
function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('application/x-earnest-item', JSON.stringify({ kind: props.kind, id: props.item.id }))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(e: DragEvent) {
  if (props.kind !== 'folder') return
  e.preventDefault()
  dragOver.value = true
}
async function onDrop(e: DragEvent) {
  dragOver.value = false
  if (props.kind !== 'folder') return
  e.preventDefault()
  e.stopPropagation()
  const raw = e.dataTransfer?.getData('application/x-earnest-item')
  if (!raw) return
  try {
    const dropped = JSON.parse(raw)
    if (dropped.id === props.item.id) return
    await ctx.move(dropped.kind, dropped.id, props.item.id)
    if (expanded.value) loadChildren()
  } catch { /* ignore */ }
}
</script>

<template>
  <div>
    <!-- Row -->
    <div
      class="group grid grid-cols-1 md:grid-cols-[1fr_120px_120px_96px] gap-2 md:gap-4 items-center pr-4 py-2.5 rounded-lg transition-colors cursor-pointer"
      :class="[dragOver ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/20', isSelected ? 'bg-primary/5' : '']"
      :draggable="true"
      @dragstart="onDragStart"
      @dragover="onDragOver"
      @dragleave="dragOver = false"
      @drop="onDrop"
      @click="kind === 'folder' ? ctx.openFolder(item) : ctx.openFile(item)"
    >
      <div class="flex items-center gap-2 min-w-0" :style="indentStyle">
        <!-- select -->
        <button
          class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          :class="{ 'opacity-100': isSelected }"
          @click.stop="ctx.toggleSelect(kind, item)"
        >
          <Icon :name="isSelected ? 'lucide:check-square' : 'lucide:square'" class="w-4 h-4" :class="isSelected ? 'text-primary' : 'text-muted-foreground'" />
        </button>
        <!-- disclosure (folders only) -->
        <button v-if="kind === 'folder'" class="shrink-0 text-muted-foreground" @click.stop="toggleExpand">
          <Icon :name="expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="w-4 h-4" />
        </button>
        <span v-else class="w-4 shrink-0" />
        <!-- icon / thumbnail -->
        <Icon v-if="kind === 'folder'" name="lucide:folder" class="w-5 h-5 text-warning shrink-0" />
        <img v-else-if="ctx.isImage(item.type)" :src="ctx.thumbUrl(item.id)" class="w-8 h-8 rounded object-cover shrink-0" loading="lazy">
        <Icon v-else :name="ctx.fileIcon(item.type)" :class="[ctx.fileIconColor(item.type), 'w-5 h-5 shrink-0']" />
        <span class="text-sm truncate" :class="kind === 'folder' ? 'font-medium' : ''">
          {{ kind === 'folder' ? item.name : ctx.fileName(item) }}
        </span>
      </div>

      <!-- size -->
      <span class="text-xs text-muted-foreground hidden md:block">
        <template v-if="kind === 'file'">{{ ctx.formatSize(item.filesize) }}</template>
        <template v-else-if="sizing"><Icon name="lucide:loader-2" class="w-3 h-3 animate-spin inline" /></template>
        <template v-else-if="size != null">{{ ctx.formatSize(size) }}</template>
        <button v-else class="hover:text-foreground underline decoration-dotted" @click.stop="loadSize">size</button>
      </span>

      <!-- modified -->
      <span class="text-xs text-muted-foreground hidden md:block">
        {{ kind === 'file' ? ctx.formatDate(item.modified_on || item.uploaded_on) : '—' }}
      </span>

      <!-- actions -->
      <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          v-if="kind === 'file'"
          class="p-1.5 transition-colors"
          :class="ctx.copiedId.value === item.id ? 'text-emerald-500' : 'text-muted-foreground hover:text-foreground'"
          :title="ctx.copiedId.value === item.id ? 'Link copied' : 'Copy link'"
          @click.stop="ctx.copyLink(item)"
        >
          <Icon :name="ctx.copiedId.value === item.id ? 'lucide:check' : 'lucide:link'" class="w-3.5 h-3.5" />
        </button>
        <button
          v-if="kind === 'file' && ctx.isOptimizable(item.type)"
          class="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          title="Optimize"
          @click.stop="ctx.optimize(item)"
        >
          <Icon name="lucide:wand-sparkles" class="w-3.5 h-3.5" />
        </button>
        <button v-if="kind === 'file'" class="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Download" @click.stop="ctx.download(item)">
          <Icon name="lucide:download" class="w-3.5 h-3.5" />
        </button>
        <button class="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Rename" @click.stop="ctx.rename(item, kind)">
          <Icon name="lucide:pencil" class="w-3.5 h-3.5" />
        </button>
        <button class="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Delete" @click.stop="ctx.remove(item, kind)">
          <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Nested children -->
    <div v-if="kind === 'folder' && expanded">
      <div v-if="loadingChildren" class="py-2 text-xs text-muted-foreground" :style="{ paddingLeft: `${(depth + 1) * 20 + 32}px` }">
        <Icon name="lucide:loader-2" class="w-3 h-3 animate-spin inline mr-1" /> Loading…
      </div>
      <template v-else>
        <FilesListNode v-for="f in childFolders" :key="'f' + f.id" :item="f" kind="folder" :depth="depth + 1" />
        <FilesListNode v-for="file in childFiles" :key="'x' + file.id" :item="file" kind="file" :depth="depth + 1" />
        <div v-if="!childFolders.length && !childFiles.length" class="py-2 text-xs text-muted-foreground/70" :style="{ paddingLeft: `${(depth + 1) * 20 + 32}px` }">
          Empty
        </div>
      </template>
    </div>
  </div>
</template>
