/**
 * usePortalItems — Read-only Directus access for client portal pages.
 *
 * Mirrors the `list` / `get` / `count` / `aggregate` shape of
 * `useDirectusItems`, but routes through `/api/portal/items` which scopes
 * results to the caller's portal context (org + parent_client walk) using
 * the admin server token. Use this from any page rendered under the
 * `client-portal` layout — portal-only users have no Directus role with
 * read perms on tickets/projects/etc, so `useDirectusItems` 403s for them.
 *
 * Writes are not exposed; portal-side mutations go through dedicated
 * server routes (e.g. `/api/messages`, future `/api/portal/tickets.post`).
 */

export interface PortalItemsQuery {
  fields?: string[];
  filter?: Record<string, any>;
  sort?: string[];
  limit?: number;
  offset?: number;
  page?: number;
  search?: string;
  deep?: Record<string, any>;
  aggregate?: Record<string, string[]>;
  groupBy?: string[];
}

export const usePortalItems = <T = any>(collection: string) => {
  const fetchWithCookies = useRequestFetch();

  const list = async (query: PortalItemsQuery = {}): Promise<T[]> => {
    return (await fetchWithCookies('/api/portal/items', {
      method: 'POST',
      body: { collection, operation: 'list', query },
    })) as T[];
  };

  const get = async (
    id: string | number,
    query: Pick<PortalItemsQuery, 'fields' | 'deep'> = {},
  ): Promise<T> => {
    return (await fetchWithCookies('/api/portal/items', {
      method: 'POST',
      body: { collection, operation: 'get', id, query },
    })) as T;
  };

  const aggregate = async (
    query: Pick<PortalItemsQuery, 'aggregate' | 'groupBy' | 'filter'>,
  ) => {
    return await fetchWithCookies('/api/portal/items', {
      method: 'POST',
      body: { collection, operation: 'aggregate', query },
    });
  };

  const count = async (filter?: Record<string, any>): Promise<number> => {
    const result = (await fetchWithCookies('/api/portal/items', {
      method: 'POST',
      body: { collection, operation: 'count', query: { filter } },
    })) as number;
    return typeof result === 'number' ? result : 0;
  };

  return { list, get, aggregate, count };
};
