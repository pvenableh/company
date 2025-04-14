// composables/useDirectusRevisions.ts
import { useDirectusClient } from './useDirectusClient';
import { readRevision as sdkReadRevision, readRevisions as sdkReadRevisions } from '@directus/sdk';

export function useDirectusRevisions() {
	const { client } = useDirectusClient();

	// Read a single revision
	const readRevision = async (id: string, query?: Record<string, any>) => {
		try {
			return await client.value.request(sdkReadRevision(id, query));
		} catch (error) {
			console.error(`Error reading revision ${id}:`, error);
			throw error;
		}
	};

	// Read multiple revisions
	const readRevisions = async (query?: Record<string, any>) => {
		try {
			return await client.value.request(sdkReadRevisions(query));
		} catch (error) {
			console.error('Error reading revisions:', error);
			throw error;
		}
	};

	return {
		readRevision,
		readRevisions,
	};
}
