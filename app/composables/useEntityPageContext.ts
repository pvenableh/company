/**
 * Provides entity page context for the dock and global components.
 *
 * Entity pages (client, project, invoice) call `provideEntityContext()`
 * to register themselves. The dock reads this to decide whether to open
 * the contextual sidebar or the global AI tray.
 */

import { panelOpen } from '~/composables/useEarnestPanel';

interface EntityPageContext {
  entityType: Ref<string | null>;
  entityId: Ref<string | null>;
  entityLabel: Ref<string>;
  sidebarOpen: Ref<boolean>;
}

const ENTITY_CONTEXT_KEY = 'entity-page-context';

// Module-level state (shared across composable consumers)
const _entityType = ref<string | null>(null);
const _entityId = ref<string | null>(null);
const _entityLabel = ref('');
// The per-entity "open" flag IS the unified panel-open state — detail pages
// that do `sidebarOpen = true` now open the one Earnest panel, which
// self-derives entity context from the refs above.
const _sidebarOpen = panelOpen;
// Optional per-page enrichment consumed by useEarnestAwareness / the panel:
//   prompts — adaptive prompt list (e.g. meeting recap derives these from
//             real action-item counts) that overrides the static defaults.
//   surface — 'live' | 'recap' distinguishes mid-call vs post-call meeting use.
const _entityPrompts = ref<string[]>([]);
const _entitySurface = ref<'live' | 'recap' | null>(null);

interface SetEntityOpts {
  prompts?: string[];
  surface?: 'live' | 'recap';
}

/**
 * Called by entity pages to register their context.
 * Automatically clears when navigating away.
 */
export function useEntityPageContext() {
  const setEntity = (type: string, id: string, label: string, opts?: SetEntityOpts) => {
    _entityType.value = type;
    _entityId.value = id;
    _entityLabel.value = label;
    _entityPrompts.value = opts?.prompts?.filter(Boolean) ?? [];
    _entitySurface.value = opts?.surface ?? null;
  };

  const clearEntity = () => {
    _entityType.value = null;
    _entityId.value = null;
    _entityLabel.value = '';
    _entityPrompts.value = [];
    _entitySurface.value = null;
    _sidebarOpen.value = false;
  };

  const toggleSidebar = () => {
    _sidebarOpen.value = !_sidebarOpen.value;
  };

  const openSidebar = () => {
    _sidebarOpen.value = true;
  };

  const closeSidebar = () => {
    _sidebarOpen.value = false;
  };

  const isOnEntityPage = computed(() => !!_entityType.value && !!_entityId.value);

  return {
    entityType: _entityType,
    entityId: _entityId,
    entityLabel: _entityLabel,
    entityPrompts: _entityPrompts,
    entitySurface: _entitySurface,
    sidebarOpen: _sidebarOpen,
    isOnEntityPage,
    setEntity,
    clearEntity,
    toggleSidebar,
    openSidebar,
    closeSidebar,
  };
}
