/**
 * useProjectEventCategories — manage the per-organization event categories that
 * render as colored labels on the project Gantt / timeline.
 *
 * Categories live in `project_event_categories` (name, color, text_color, icon)
 * and are scoped to the active org via the `organization` FK. Writes route
 * through the unified items gate (registered in `tenant-write-registry.ts` under
 * the `projects` feature), which auto-stamps the org and enforces the role
 * matrix — so we don't strictly need to set `organization` here, but we do for
 * clarity and optimistic UI.
 */
import type { CategoryKind, CategoryPreset } from '~~/shared/event-category-presets';
import { legibleTextOn } from '~/utils/color-contrast';

export interface ProjectEventCategoryRow {
  id: string;
  status: 'published' | 'draft' | 'archived';
  sort?: number | null;
  name: string;
  color: string;
  text_color?: string | null;
  icon?: string | null;
  kind?: CategoryKind | null;
  organization?: string | null;
}

export function useProjectEventCategories() {
  const categories = useDirectusItems('project_event_categories');
  const organizations = useDirectusItems('organizations');
  const { selectedOrg } = useOrganization();

  const list = async (opts: { includeArchived?: boolean } = {}): Promise<ProjectEventCategoryRow[]> => {
    if (!selectedOrg.value) return [];
    const statusValues = opts.includeArchived
      ? ['published', 'draft', 'archived']
      : ['published', 'draft'];
    return (await categories.list({
      fields: ['id', 'name', 'color', 'text_color', 'icon', 'kind', 'status', 'sort'],
      filter: {
        organization: { _eq: selectedOrg.value },
        status: { _in: statusValues },
      },
      sort: ['sort', 'name'],
      limit: 200,
    })) as ProjectEventCategoryRow[];
  };

  /** The active org's industry class slug (for auto-selecting a preset pack). */
  const industryClass = async (): Promise<string | null> => {
    if (!selectedOrg.value) return null;
    try {
      const org: any = await organizations.get(selectedOrg.value, { fields: ['industry.class'] });
      const ind = org?.industry;
      return (typeof ind === 'object' ? ind?.class : null) ?? null;
    } catch {
      return null;
    }
  };

  /** Bulk-seed a preset pack into the org. Returns the created rows. */
  const seed = async (presets: CategoryPreset[]): Promise<ProjectEventCategoryRow[]> => {
    const created: ProjectEventCategoryRow[] = [];
    for (let i = 0; i < presets.length; i++) {
      const p = presets[i];
      const row = await create({
        name: p.name,
        color: p.color,
        text_color: legibleTextOn(p.color),
        icon: p.icon,
        kind: p.kind,
        sort: i,
      });
      created.push(row);
    }
    return created;
  };

  const create = async (data: Partial<ProjectEventCategoryRow>): Promise<ProjectEventCategoryRow> => {
    return (await categories.create({
      ...data,
      organization: data.organization || selectedOrg.value,
      status: data.status || 'published',
    } as any)) as ProjectEventCategoryRow;
  };

  const update = async (id: string, data: Partial<ProjectEventCategoryRow>): Promise<ProjectEventCategoryRow> => {
    return (await categories.update(id, data as any)) as ProjectEventCategoryRow;
  };

  const remove = async (id: string): Promise<void> => {
    await categories.remove(id);
  };

  return { list, create, update, remove, seed, industryClass };
}
