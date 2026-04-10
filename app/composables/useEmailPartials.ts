import type { EmailPartial, EmailPartialType } from '~~/shared/email/blocks';

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

  /**
   * Get the partial for a specific org + type.
   * Prioritizes org-specific partial, then falls back to the system default.
   */
  const getOrgPartial = async (
    type: EmailPartialType,
    orgId: string | null,
  ): Promise<EmailPartial | null> => {
    // 1. Try org-specific partial first
    if (orgId) {
      const orgResults = await items.list({
        fields: ['*'],
        filter: {
          _and: [
            { type: { _eq: type } },
            { organization: { _eq: orgId } },
            { status: { _eq: 'published' } },
          ],
        },
        sort: ['-is_default', 'name'],
        limit: 1,
      });
      if (orgResults.length > 0) return orgResults[0];
    }

    // 2. Fall back to system default (no org)
    return getDefaultPartial(type);
  };

  /**
   * Get all available partials for a type, including org-specific and system defaults.
   * Useful for a partial selector dropdown.
   */
  const getAvailablePartials = async (
    type: EmailPartialType,
    orgId: string | null,
  ): Promise<EmailPartial[]> => {
    const filter: Record<string, any> = {
      _and: [
        { type: { _eq: type } },
        { status: { _eq: 'published' } },
        {
          _or: [
            { organization: { _null: true } }, // System defaults
            ...(orgId ? [{ organization: { _eq: orgId } }] : []),
          ],
        },
      ],
    };

    return items.list({
      fields: ['*'],
      filter,
      sort: ['organization', '-is_default', 'name'],
    });
  };

  const createPartial = async (data: Partial<EmailPartial>): Promise<EmailPartial> => {
    return items.create({ status: 'published', ...data });
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
    getOrgPartial,
    getAvailablePartials,
    createPartial,
    updatePartial,
    deletePartial,
  };
}
