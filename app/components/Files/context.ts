import type { Ref } from 'vue'

/**
 * Shared context injected by the Files page into the recursive <FilesListNode>
 * tree so selection, actions, moves, lazy fetches, and formatting helpers don't
 * have to be prop-drilled through arbitrarily deep nesting.
 */
export interface FilesContext {
  organization: Ref<string | null>
  /** Reactive membership check for selected item ids (files + folders). */
  selected: { has(id: string): boolean }
  /** Bump to invalidate expanded nodes so they refetch (after a move/delete). */
  bump: Ref<number>

  toggleSelect: (kind: 'file' | 'folder', item: any) => void
  openFile: (file: any) => void
  /** Drill into a folder (change the current folder / breadcrumb). */
  openFolder: (folder: any) => void
  download: (file: any) => void
  copyLink: (file: any) => void
  /** id of the file whose link was just copied (for transient "copied" UI). */
  copiedId: Ref<string | null>
  optimize: (file: any) => void
  isOptimizable: (type: string) => boolean
  rename: (item: any, kind: 'file' | 'folder') => void
  remove: (item: any, kind: 'file' | 'folder') => void
  move: (kind: 'file' | 'folder', id: string, targetFolderId: string | null) => Promise<void>

  fetchFolders: (parentId: string | null) => Promise<any[]>
  fetchFiles: (folderId: string | null) => Promise<any[]>
  folderSize: (folderId: string) => Promise<number>

  isImage: (type: string) => boolean
  thumbUrl: (id: string) => string
  fileIcon: (type: string) => string
  fileIconColor: (type: string) => string
  fileName: (file: any) => string
  formatSize: (bytes: number | null | undefined) => string
  formatDate: (d: string | null) => string
}
