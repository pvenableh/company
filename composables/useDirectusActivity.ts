// composables/useDirectusActivity.ts
/**
 * useDirectusActivity - Activity log composable
 *
 * Provides access to Directus activity/audit log
 *
 * Usage:
 * const { list, get, getForItem, getForUser } = useDirectusActivity()
 */

export interface DirectusActivity {
  id: number;
  action: string;
  user: string | null;
  timestamp: string;
  ip: string | null;
  user_agent: string | null;
  collection: string;
  item: string;
  comment: string | null;
  origin: string | null;
}

export function useDirectusActivity() {
  const { loggedIn } = useUserSession();

  /**
   * List activity logs with optional filtering
   */
  const list = async (query?: {
    filter?: Record<string, any>;
    fields?: string[];
    sort?: string[];
    limit?: number;
    offset?: number;
  }): Promise<DirectusActivity[]> => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    return await $fetch("/api/directus/activity", {
      method: "POST",
      body: {
        operation: "list",
        query: {
          ...query,
          sort: query?.sort || ["-timestamp"],
        },
      },
    });
  };

  /**
   * Get single activity entry
   */
  const get = async (
    id: number,
    query?: { fields?: string[] }
  ): Promise<DirectusActivity> => {
    if (!loggedIn.value) {
      throw new Error("Authentication required");
    }

    return await $fetch("/api/directus/activity", {
      method: "POST",
      body: {
        operation: "get",
        id,
        query,
      },
    });
  };

  /**
   * Get activity for a specific item
   */
  const getForItem = async (
    collection: string,
    itemId: string,
    query?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<DirectusActivity[]> => {
    return await list({
      filter: {
        collection: { _eq: collection },
        item: { _eq: itemId },
      },
      ...query,
    });
  };

  /**
   * Get activity for a specific user
   */
  const getForUser = async (
    userId: string,
    query?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<DirectusActivity[]> => {
    return await list({
      filter: {
        user: { _eq: userId },
      },
      ...query,
    });
  };

  /**
   * Get recent activity
   */
  const getRecent = async (limit: number = 50): Promise<DirectusActivity[]> => {
    return await list({
      limit,
      sort: ["-timestamp"],
    });
  };

  return {
    list,
    get,
    getForItem,
    getForUser,
    getRecent,
  };
}
