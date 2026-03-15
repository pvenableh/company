import type { Product } from '~/types/directus';

export function useProducts() {
  const items = useDirectusItems<Product>('products');

  const getProducts = async (params?: {
    status?: string;
    type?: string;
    search?: string;
    sort?: string[];
    limit?: number;
    page?: number;
  }): Promise<{ data: Product[]; total: number }> => {
    const filter: any = { _and: [] };

    if (params?.status && params.status !== 'all') {
      filter._and.push({ status: { _eq: params.status } });
    }

    if (params?.type && params.type !== 'all') {
      filter._and.push({ type: { _eq: params.type } });
    }

    if (params?.search) {
      filter._and.push({
        _or: [
          { name: { _icontains: params.search } },
          { description: { _icontains: params.search } },
        ],
      });
    }

    const data = await items.list({
      fields: ['id', 'name', 'type', 'price', 'description', 'status', 'sort', 'date_created'],
      filter: filter._and.length ? filter : undefined,
      sort: params?.sort || ['name'],
      limit: params?.limit || 200,
      page: params?.page || 1,
    });

    const total = await items.count(filter._and.length ? filter : undefined);

    return { data, total };
  };

  const getProduct = async (id: string): Promise<Product> => {
    return items.get(id, {
      fields: ['*'],
    });
  };

  const createProduct = async (payload: Partial<Product>): Promise<Product> => {
    return items.create(payload as any);
  };

  const updateProduct = async (id: string, payload: Partial<Product>): Promise<Product> => {
    return items.update(id, payload);
  };

  const deleteProduct = async (id: string): Promise<boolean> => {
    return items.remove(id);
  };

  return {
    getProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
  };
}
