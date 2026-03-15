// server/api/directus/folders.post.ts
/**
 * Server API route for folder operations
 * Uses native Directus SDK methods for folder management
 */

import {
  readFolders,
  readFolder,
  createFolder,
  updateFolder,
  deleteFolder,
} from '@directus/sdk';

export default defineEventHandler(async (event) => {
  try {
    await requireUserSession(event);
    const body = await readBody(event);
    const { operation, id, data, query } = body;

    if (!operation) {
      throw createError({
        statusCode: 400,
        message: 'Operation is required',
      });
    }

    const directus = await getUserDirectus(event);

    switch (operation) {
      case 'list':
        return await directus.request(readFolders(query || {}));

      case 'get':
        if (!id) throw new Error('Folder ID required for get operation');
        return await directus.request(readFolder(id, query || {}));

      case 'create':
        if (!data) throw new Error('Data required for create operation');
        return await directus.request(createFolder(data));

      case 'update':
        if (!id) throw new Error('Folder ID required for update operation');
        if (!data) throw new Error('Data required for update operation');
        return await directus.request(updateFolder(id, data));

      case 'delete':
        if (!id) throw new Error('Folder ID required for delete operation');
        await directus.request(deleteFolder(id));
        return { deleted: 1 };

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  } catch (error: any) {
    console.error('Directus folders API error:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to perform folder operation',
    });
  }
});
