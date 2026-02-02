// composables/useDirectusFiles.ts
/**
 * useDirectusFiles - File operations composable
 *
 * Handles file uploads, downloads, updates, and deletions
 * using native Directus SDK methods
 *
 * Usage:
 * const { list, get, upload, update, remove, getUrl } = useDirectusFiles()
 */

export const useDirectusFiles = () => {
  const config = useRuntimeConfig();
  const { loggedIn } = useUserSession();

  /**
   * Get file URL with optional transformations
   */
  const getUrl = (
    fileId: string,
    options?: {
      width?: number;
      height?: number;
      fit?: "cover" | "contain" | "inside" | "outside";
      quality?: number;
      format?: "jpg" | "png" | "webp" | "tiff" | "avif";
      key?: string;
    }
  ) => {
    if (!fileId) return null;

    const baseUrl = `${config.public.directus.url}/assets/${fileId}`;

    if (!options) return baseUrl;

    const params = new URLSearchParams();

    if (options.key) {
      params.append("key", options.key);
      return `${baseUrl}?${params.toString()}`;
    }

    if (options.width) params.append("width", options.width.toString());
    if (options.height) params.append("height", options.height.toString());
    if (options.fit) params.append("fit", options.fit);
    if (options.quality) params.append("quality", options.quality.toString());
    if (options.format) params.append("format", options.format);

    return `${baseUrl}?${params.toString()}`;
  };

  /**
   * Get optimized image URL that preserves transparency
   */
  const getOptimizedUrl = (
    fileId: string,
    size: "xs" | "sm" | "md" | "lg" | "xl" | number = "md",
    options?: {
      format?: "webp" | "png" | "avif";
      quality?: number;
      fit?: "inside" | "cover";
    }
  ) => {
    if (!fileId) return null;

    const sizeMap = { xs: 32, sm: 64, md: 128, lg: 256, xl: 512 };
    const width = typeof size === "number" ? size : sizeMap[size];

    return getUrl(fileId, {
      width,
      fit: options?.fit ?? "inside",
      format: options?.format ?? "webp",
      quality: options?.quality ?? 80,
    });
  };

  /**
   * List files with optional filtering
   */
  const list = async (query?: {
    filter?: Record<string, any>;
    fields?: string[];
    sort?: string[];
    limit?: number;
    search?: string;
  }) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    return await $fetch("/api/directus/files", {
      method: "POST",
      body: {
        operation: "list",
        query,
      },
    });
  };

  /**
   * Get single file metadata
   */
  const get = async (fileId: string, fields?: string[]) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    return await $fetch("/api/directus/files", {
      method: "POST",
      body: {
        operation: "get",
        id: fileId,
        query: { fields },
      },
    });
  };

  /**
   * Upload a file
   */
  const upload = async (
    file: File,
    metadata?: {
      title?: string;
      description?: string;
      folder?: string | { id: string };
      tags?: string[];
    }
  ) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    const formData = new FormData();
    formData.append("file", file);

    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        if (value === undefined || value === null) return;

        if (key === "folder" && typeof value === "object" && "id" in value) {
          formData.append(key, (value as { id: string }).id);
        } else if (Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      });
    }

    return await $fetch("/api/directus/files/upload", {
      method: "POST",
      body: formData,
    });
  };

  /**
   * Update file metadata
   */
  const update = async (
    fileId: string,
    updates: {
      title?: string;
      description?: string;
      folder?: string;
      tags?: string[];
    }
  ) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    return await $fetch("/api/directus/files", {
      method: "POST",
      body: {
        operation: "update",
        id: fileId,
        data: updates,
      },
    });
  };

  /**
   * Delete file
   */
  const remove = async (fileId: string | string[]) => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    await $fetch("/api/directus/files", {
      method: "POST",
      body: {
        operation: "delete",
        id: fileId,
      },
    });

    return true;
  };

  /**
   * List files by folder
   */
  const listByFolder = async (
    folderId: string | null,
    query?: {
      fields?: string[];
      sort?: string[];
      limit?: number;
      search?: string;
    }
  ) => {
    const filter = folderId
      ? { folder: { _eq: folderId } }
      : { folder: { _null: true } };

    return await list({
      filter,
      ...query,
    });
  };

  return {
    list,
    get,
    upload,
    update,
    remove,
    delete: remove,
    getUrl,
    getOptimizedUrl,
    listByFolder,
  };
};
