import type { NewsletterBlock, BlockCategory } from '~~/shared/email/blocks';

export function useNewsletterBlocks() {
  const items = useDirectusItems<NewsletterBlock>('newsletter_blocks');

  const getBlocks = async (category?: BlockCategory): Promise<NewsletterBlock[]> => {
    const filter: Record<string, any> = { status: { _eq: 'published' } };
    if (category) {
      filter.category = { _eq: category };
    }
    return items.list({
      fields: ['*'],
      filter,
      sort: ['category', 'sort', 'name'],
    });
  };

  const getBlockLibrary = async (): Promise<Record<string, NewsletterBlock[]>> => {
    const blocks = await getBlocks();
    const grouped: Record<string, NewsletterBlock[]> = {};
    for (const block of blocks) {
      if (!grouped[block.category]) grouped[block.category] = [];
      grouped[block.category].push(block);
    }
    return grouped;
  };

  const createBlock = async (payload: Partial<NewsletterBlock>): Promise<NewsletterBlock> => {
    return items.create({ status: 'published', ...payload });
  };

  const updateBlock = async (id: number, payload: Partial<NewsletterBlock>): Promise<NewsletterBlock> => {
    return items.update(id, payload);
  };

  return { getBlocks, getBlockLibrary, createBlock, updateBlock };
}
