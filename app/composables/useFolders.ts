// composables/useFolders.ts
/**
 * useFolders — Folder CRUD operations for Directus file system
 *
 * Handles listing, creating, updating, and deleting folders
 * via the /api/directus/folders server endpoint.
 */

export interface DirectusFolder {
  id: string;
  name: string;
  parent: string | null | DirectusFolder;
}

export const useFolders = () => {
  const { loggedIn } = useUserSession();

  const list = async (query?: {
    filter?: Record<string, any>;
    fields?: string[];
    sort?: string[];
    limit?: number;
  }): Promise<DirectusFolder[]> => {
    if (!loggedIn.value) throw new Error('Authentication required');

    return await $fetch('/api/directus/folders', {
      method: 'POST',
      body: { operation: 'list', query },
    }) as DirectusFolder[];
  };

  const get = async (id: string): Promise<DirectusFolder> => {
    if (!loggedIn.value) throw new Error('Authentication required');

    return await $fetch('/api/directus/folders', {
      method: 'POST',
      body: { operation: 'get', id },
    }) as DirectusFolder;
  };

  const create = async (data: { name: string; parent?: string | null }): Promise<DirectusFolder> => {
    if (!loggedIn.value) throw new Error('Authentication required');

    return await $fetch('/api/directus/folders', {
      method: 'POST',
      body: { operation: 'create', data },
    }) as DirectusFolder;
  };

  const update = async (id: string, data: { name?: string; parent?: string | null }): Promise<DirectusFolder> => {
    if (!loggedIn.value) throw new Error('Authentication required');

    return await $fetch('/api/directus/folders', {
      method: 'POST',
      body: { operation: 'update', id, data },
    }) as DirectusFolder;
  };

  const remove = async (id: string): Promise<boolean> => {
    if (!loggedIn.value) throw new Error('Authentication required');

    await $fetch('/api/directus/folders', {
      method: 'POST',
      body: { operation: 'delete', id },
    });
    return true;
  };

  /**
   * Get subfolders of a given parent folder (or root if null)
   */
  const getChildren = async (parentId: string | null): Promise<DirectusFolder[]> => {
    const filter = parentId
      ? { parent: { _eq: parentId } }
      : { parent: { _null: true } };

    return await list({
      filter,
      fields: ['id', 'name', 'parent'],
      sort: ['name'],
      limit: -1,
    });
  };

  return {
    list,
    get,
    create,
    update,
    remove,
    getChildren,
  };
};
