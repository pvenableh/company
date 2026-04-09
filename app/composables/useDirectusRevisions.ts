// composables/useDirectusRevisions.ts
// All operations go through server API routes - no client-side tokens

export function useDirectusRevisions() {
	// Read a single revision
	const readRevision = async (id: string, query?: Record<string, any>) => {
		return await $fetch('/api/directus/revisions', {
			method: 'POST',
			body: { operation: 'get', id, query },
		});
	};

	// Read multiple revisions
	const readRevisions = async (query?: Record<string, any>) => {
		return await $fetch('/api/directus/revisions', {
			method: 'POST',
			body: { operation: 'list', query },
		});
	};

	return {
		readRevision,
		readRevisions,
	};
}
