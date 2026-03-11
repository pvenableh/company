import type { EmailPartial, EmailPartialType } from '~/types/email/blocks';

export function useEmailPartials() {
  const items = useDirectusItems<EmailPartial>('email_partials');

  const getPartials = async (type?: EmailPartialType): Promise<EmailPartial[]> => {
    const filter: Record<string, any> = {};
    if (type) filter.type = { _eq: type };
    return items.list({
      fields: ['*'],
      filter: Object.keys(filter).length ? filter : undefined,
      sort: ['-is_default', 'name'],
    });
  };

  const getPartial = async (id: number): Promise<EmailPartial> => {
    return items.get(id, { fields: ['*'] });
  };

  const getDefaultPartial = async (type: EmailPartialType): Promise<EmailPartial | null> => {
    const results = await items.list({
      fields: ['*'],
      filter: {
        _and: [
          { type: { _eq: type } },
          { is_default: { _eq: true } },
          { status: { _eq: 'published' } },
        ],
      },
      limit: 1,
    });
    return results.length > 0 ? results[0] : null;
  };

  const createPartial = async (data: Partial<EmailPartial>): Promise<EmailPartial> => {
    return items.create(data);
  };

  const updatePartial = async (id: number, data: Partial<EmailPartial>): Promise<EmailPartial> => {
    return items.update(id, data);
  };

  const deletePartial = async (id: number): Promise<boolean> => {
    return items.remove(id);
  };

  return {
    getPartials,
    getPartial,
    getDefaultPartial,
    createPartial,
    updatePartial,
    deletePartial,
  };
}
