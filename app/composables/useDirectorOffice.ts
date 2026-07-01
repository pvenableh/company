/**
 * useDirectorOffice — shared open/close state for the Director's Office overlay
 * (app/components/CommandCenter/DirectorOffice.vue, mounted once in app.vue).
 *
 * The office opens *over* whatever page the user is on and closes back to it, so
 * this is deliberately global state, not a route. Two scopes:
 *   - org-wide meeting: `open()`
 *   - focused one-item meeting: `open({ mode:'entity', entityType, entityId, label })`
 */
export interface DirectorScope {
  mode: 'org' | 'entity';
  /** Plural collection for a focused meeting (e.g. 'projects', 'leads'). */
  entityType?: string;
  entityId?: string;
  /** Human label for the header (e.g. the project title / client name). */
  label?: string;
}

export function useDirectorOffice() {
  const isOpen = useState<boolean>('director-office-open', () => false);
  const scope = useState<DirectorScope | null>('director-office-scope', () => null);

  function open(next?: DirectorScope) {
    scope.value = next ?? { mode: 'org' };
    isOpen.value = true;
  }
  function close() {
    isOpen.value = false;
  }

  return { isOpen, scope, open, close };
}
