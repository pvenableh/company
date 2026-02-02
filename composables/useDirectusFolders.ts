// composables/useDirectusFolders.ts
/**
 * useDirectusFolders - Folder operations composable
 *
 * Handles folder management operations (create, read, update, delete)
 * using native Directus SDK methods
 *
 * Usage:
 * const { list, get, create, update, remove } = useDirectusFolders()
 */

export const useDirectusFolders = () => {
  const { loggedIn } = useUserSession();

  /**
   * List folders with optional filtering
   */
  const list = async (query?: {
    filter?: Record<string, any>;
    fields?: string[];
    sort?: string[];
    limit?: number;
    offset?: number;
    search?: string;
  }) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    return await $fetch("/api/directus/folders", {
      method: "POST",
      body: {
        operation: "list",
        query,
      },
    });
  };

  /**
   * Get single folder by ID
   */
  const get = async (
    folderId: string,
    query?: {
      fields?: string[];
    }
  ) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    return await $fetch("/api/directus/folders", {
      method: "POST",
      body: {
        operation: "get",
        id: folderId,
        query,
      },
    });
  };

  /**
   * Create a single folder
   */
  const create = async (folderData: { name: string; parent?: string | null }) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    return await $fetch("/api/directus/folders", {
      method: "POST",
      body: {
        operation: "create",
        data: folderData,
      },
    });
  };

  /**
   * Update single folder
   */
  const update = async (
    folderId: string,
    updates: {
      name?: string;
      parent?: string | null;
    }
  ) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    return await $fetch("/api/directus/folders", {
      method: "POST",
      body: {
        operation: "update",
        id: folderId,
        data: updates,
      },
    });
  };

  /**
   * Delete folder
   */
  const remove = async (folderId: string) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    await $fetch("/api/directus/folders", {
      method: "POST",
      body: {
        operation: "delete",
        id: folderId,
      },
    });

    return true;
  };

  /**
   * Get folders by parent
   */
  const getByParent = async (parentId: string | null) => {
    const filter = parentId
      ? { parent: { _eq: parentId } }
      : { parent: { _null: true } };

    return await list({ filter });
  };

  /**
   * Get root folders (no parent)
   */
  const getRootFolders = async () => {
    return await getByParent(null);
  };

  return {
    list,
    get,
    create,
    update,
    remove,
    delete: remove,
    getByParent,
    getRootFolders,
  };
};
