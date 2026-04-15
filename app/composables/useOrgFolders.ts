// composables/useOrgFolders.ts
/**
 * useOrgFolders — Resolve org subfolder IDs (Clients, Financials, Uploads)
 *
 * Caches results per session via useState so repeated calls
 * don't hit the API. Call `invalidateCache()` after creating
 * new subfolders (e.g. backfill) to force a refresh.
 */

type OrgSubfolder = 'Clients' | 'Financials' | 'Uploads';

interface SubfolderCache {
  [orgFolderId: string]: {
    Clients?: string;
    Financials?: string;
    Uploads?: string;
  };
}

export function useOrgFolders() {
  const { currentOrg } = useOrganization();
  const { getChildren } = useFolders();
  const cache = useState<SubfolderCache>('orgSubfolderCache', () => ({}));

  /**
   * Get the org root folder ID from the current org
   */
  const getOrgFolderId = (): string | null => {
    if (!currentOrg.value?.folder) return null;
    return typeof currentOrg.value.folder === 'object'
      ? (currentOrg.value.folder as any).id
      : currentOrg.value.folder;
  };

  /**
   * Resolve and cache all subfolders for the current org's root folder
   */
  const resolveSubfolders = async (orgFolderId: string) => {
    if (cache.value[orgFolderId]) return cache.value[orgFolderId];

    const children = await getChildren(orgFolderId);
    const resolved: SubfolderCache[string] = {};
    for (const child of children) {
      if (child.name === 'Clients' || child.name === 'Financials' || child.name === 'Uploads') {
        resolved[child.name as OrgSubfolder] = child.id;
      }
    }
    cache.value[orgFolderId] = resolved;
    return resolved;
  };

  /**
   * Get a specific subfolder ID by name for the current org.
   * Returns null if org has no folder or subfolder doesn't exist.
   */
  const getOrgSubfolder = async (name: OrgSubfolder): Promise<string | null> => {
    const orgFolderId = getOrgFolderId();
    if (!orgFolderId) return null;

    const subfolders = await resolveSubfolders(orgFolderId);
    return subfolders[name] || null;
  };

  /**
   * Clear cached subfolder IDs (e.g. after backfill or manual creation)
   */
  const invalidateCache = () => {
    cache.value = {};
  };

  return {
    getOrgFolderId,
    getOrgSubfolder,
    invalidateCache,
  };
}
