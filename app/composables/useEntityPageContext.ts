/**
 * Provides entity page context for the dock and global components.
 *
 * Entity pages (client, project, invoice) call `provideEntityContext()`
 * to register themselves. The dock reads this to decide whether to open
 * the contextual sidebar or the global AI tray.
 */

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
const _sidebarOpen = ref(false);

/**
 * Called by entity pages to register their context.
 * Automatically clears when navigating away.
 */
export function useEntityPageContext() {
  const setEntity = (type: string, id: string, label: string) => {
    _entityType.value = type;
    _entityId.value = id;
    _entityLabel.value = label;
  };

  const clearEntity = () => {
    _entityType.value = null;
    _entityId.value = null;
    _entityLabel.value = '';
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
    sidebarOpen: _sidebarOpen,
    isOnEntityPage,
    setEntity,
    clearEntity,
    toggleSidebar,
    openSidebar,
    closeSidebar,
  };
}
