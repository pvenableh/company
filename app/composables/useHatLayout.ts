/**
 * @deprecated Hats removed in Apps Layout Phase 7.
 *
 * This composable used to gate which dashboard widgets appeared based on
 * the active hat. Hats were superseded by Apps Mode, which fragments the
 * surface by role at the route level. To avoid churn during the
 * deprecation window, the composable still exists but is now a no-op:
 *
 *   - showWidget(_) always returns true
 *   - hatModules    always returns null (run every analyzer)
 *
 * Callers can be unwound at any time. File will be removed after one
 * release cycle.
 */
export const useHatLayout = () => {
	const showWidget = (_widget: string): boolean => true;
	const hatModules = computed<string[] | null>(() => null);
	return { showWidget, hatModules };
};
