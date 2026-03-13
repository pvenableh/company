<script setup lang="ts">
/**
 * PermissionGate — Renderless permission wrapper
 *
 * Conditionally renders its default slot based on the current user's
 * org role permissions. Optionally renders a #denied slot when access
 * is denied.
 *
 * Usage:
 *   <PermissionGate feature="projects" action="create">
 *     <UButton>Create Project</UButton>
 *     <template #denied>
 *       <p class="text-muted-foreground text-sm">You don't have permission to create projects.</p>
 *     </template>
 *   </PermissionGate>
 *
 *   <!-- Access-only check (no specific CRUD action) -->
 *   <PermissionGate feature="invoices">
 *     <InvoiceTable />
 *   </PermissionGate>
 */

import type { FeatureKey, CrudAction } from '~/types/permissions';

const props = defineProps<{
  /** The feature to check access for */
  feature: FeatureKey;
  /** Optional CRUD action — if omitted, checks access only */
  action?: CrudAction;
}>();

const { canAccess, hasPermission } = useOrgRole();

const allowed = computed(() => {
  if (props.action) {
    return hasPermission(props.feature, props.action);
  }
  return canAccess(props.feature);
});
</script>

<template>
  <slot v-if="allowed" />
  <slot v-else name="denied" />
</template>
