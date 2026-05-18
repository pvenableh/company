/**
 * useDocumentBlocks — manage org-scoped reusable content blocks (bio,
 * references, deliverables, terms, NDA, case studies) that compose into
 * proposals + contracts.
 *
 * Block-entry types now live in `shared/blocks/` so server + scripts can
 * read them without pulling in Vue. Re-exported here for back-compat.
 */

import type { BlockType, BlockAppliesTo as _BlockAppliesTo } from '~~/shared/blocks/registry';
import type { BlockPayload, DocumentBlockEntry as _DocumentBlockEntry } from '~~/shared/blocks/types';

export type BlockCategory =
  | 'bio'
  | 'references'
  | 'case_study'
  | 'deliverables'
  | 'pricing'
  | 'timeline'
  | 'terms'
  | 'nda'
  | 'cover'
  | 'other';

export type BlockAppliesTo = _BlockAppliesTo;
export type DocumentBlockEntry = _DocumentBlockEntry;

export interface DocumentBlock {
  id: string;
  status: 'published' | 'draft' | 'archived';
  name: string;
  category: BlockCategory;
  description: string | null;
  /** Legacy markdown body. New rows set `type` + `payload` instead. */
  content: string | null;
  /** Typed-block discriminator. Pre-migration rows are null → treated as `rich_text`. */
  type?: BlockType | null;
  /** Typed payload matching `type`. For legacy rich_text rows, derived from `content`. */
  payload?: BlockPayload | null;
  applies_to: BlockAppliesTo[];
  organization: string;
  date_created?: string;
  date_updated?: string;
  user_created?: string;
  user_updated?: string;
}

export function useDocumentBlocks() {
  const blocks = useDirectusItems('document_blocks');
  const { selectedOrg } = useOrganization();

  // Directus 11's `json` field doesn't support `_contains`, so we fetch
  // org-scoped + status-filtered rows and apply the `applies_to` filter
  // client-side. Empty applies_to is treated as "applies everywhere".
  const matchesAppliesTo = (b: DocumentBlock, target?: BlockAppliesTo) =>
    !target || !b.applies_to || (Array.isArray(b.applies_to) && b.applies_to.includes(target));

  const list = async (opts: { includeArchived?: boolean; appliesTo?: BlockAppliesTo } = {}): Promise<DocumentBlock[]> => {
    if (!selectedOrg.value) return [];
    const statusValues = opts.includeArchived
      ? ['published', 'draft', 'archived']
      : ['published', 'draft'];
    const rows = (await blocks.list({
      fields: ['*'],
      filter: {
        organization: { _eq: selectedOrg.value },
        status: { _in: statusValues },
      },
      sort: ['category', 'name'],
      limit: 500,
    })) as DocumentBlock[];
    return opts.appliesTo ? rows.filter((b) => matchesAppliesTo(b, opts.appliesTo)) : rows;
  };

  const listPublished = async (appliesTo?: BlockAppliesTo): Promise<DocumentBlock[]> => {
    if (!selectedOrg.value) return [];
    const rows = (await blocks.list({
      fields: ['id', 'name', 'category', 'description', 'content', 'type', 'payload', 'applies_to'],
      filter: {
        organization: { _eq: selectedOrg.value },
        status: { _eq: 'published' },
      },
      sort: ['category', 'name'],
      limit: 200,
    })) as DocumentBlock[];
    return appliesTo ? rows.filter((b) => matchesAppliesTo(b, appliesTo)) : rows;
  };

  const create = async (data: Partial<DocumentBlock>): Promise<DocumentBlock> => {
    return (await blocks.create({
      ...data,
      organization: data.organization || selectedOrg.value,
      status: data.status || 'published',
      applies_to: data.applies_to || ['proposals', 'contracts'],
    } as any)) as DocumentBlock;
  };

  const update = async (id: string, data: Partial<DocumentBlock>): Promise<DocumentBlock> => {
    return (await blocks.update(id, data as any)) as DocumentBlock;
  };

  const remove = async (id: string): Promise<void> => {
    await blocks.remove(id);
  };

  return { list, listPublished, create, update, remove };
}
