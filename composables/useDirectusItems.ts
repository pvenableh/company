// composables/useDirectusItems.ts
import { useDirectusClient } from './useDirectusClient';
import {
	createItem,
	createItems,
	readItem,
	readItems,
	readSingleton,
	updateItem,
	updateItems,
	updateSingleton,
	deleteItem,
	deleteItems,
} from '@directus/sdk';

export function useDirectusItems() {
	const { client } = useDirectusClient();

	// Create a single item
	const createItemFn = async <T>(collection: string, item: Partial<T>) => {
		try {
			return await client.value.request(createItem(collection, item));
		} catch (error) {
			console.error(`Error creating item in ${collection}:`, error);
			throw error;
		}
	};

	// Create multiple items
	const createItemsFn = async <T>(collection: string, items: Partial<T>[]) => {
		try {
			return await client.value.request(createItems(collection, items));
		} catch (error) {
			console.error(`Error creating items in ${collection}:`, error);
			throw error;
		}
	};

	// Read a single item
	const readItemFn = async <T>(collection: string, id: string | number, query?: Record<string, any>) => {
		try {
			return await client.value.request(readItem(collection, id, query));
		} catch (error) {
			console.error(`Error reading item from ${collection}:`, error);
			throw error;
		}
	};

	// Read a single item asynchronously
	const readAsyncItemFn = async <T>(collection: string, id: string | number, query?: Record<string, any>) => {
		try {
			return await client.value.request(readItem(collection, id, query));
		} catch (error) {
			console.error(`Error reading async item from ${collection}:`, error);
			throw error;
		}
	};

	// Read multiple items
	const readItemsFn = async <T>(collection: string, query?: Record<string, any>) => {
		try {
			return await client.value.request(readItems(collection, query));
		} catch (error) {
			console.error(`Error reading items from ${collection}:`, error);
			throw error;
		}
	};

	// Read multiple items asynchronously
	const readAsyncItemsFn = async <T>(collection: string, query?: Record<string, any>) => {
		try {
			return await client.value.request(readItems(collection, query));
		} catch (error) {
			console.error(`Error reading async items from ${collection}:`, error);
			throw error;
		}
	};

	// Read a singleton
	const readSingletonFn = async <T>(collection: string, query?: Record<string, any>) => {
		try {
			return await client.value.request(readSingleton(collection, query));
		} catch (error) {
			console.error(`Error reading singleton from ${collection}:`, error);
			throw error;
		}
	};

	// Read a singleton asynchronously
	const readAsyncSingletonFn = async <T>(collection: string, query?: Record<string, any>) => {
		try {
			return await client.value.request(readSingleton(collection, query));
		} catch (error) {
			console.error(`Error reading async singleton from ${collection}:`, error);
			throw error;
		}
	};

	// Update a single item
	const updateItemFn = async <T>(collection: string, id: string | number, item: Partial<T>) => {
		try {
			return await client.value.request(updateItem(collection, id, item));
		} catch (error) {
			console.error(`Error updating item in ${collection}:`, error);
			throw error;
		}
	};

	// Update multiple items
	const updateItemsFn = async <T>(collection: string, items: Record<string, Partial<T>>) => {
		try {
			return await client.value.request(updateItems(collection, items, { query: {} }));
		} catch (error) {
			console.error(`Error updating items in ${collection}:`, error);
			throw error;
		}
	};

	// Update a singleton
	const updateSingletonFn = async <T>(collection: string, item: Partial<T>) => {
		try {
			return await client.value.request(updateSingleton(collection, item));
		} catch (error) {
			console.error(`Error updating singleton in ${collection}:`, error);
			throw error;
		}
	};

	// Delete a single item
	const deleteItemFn = async (collection: string, id: string | number) => {
		try {
			return await client.value.request(deleteItem(collection, id));
		} catch (error) {
			console.error(`Error deleting item from ${collection}:`, error);
			throw error;
		}
	};

	// Delete multiple items
	const deleteItemsFn = async (collection: string, ids: (string | number)[] | Record<string, any>) => {
		try {
			return await client.value.request(deleteItems(collection, ids));
		} catch (error) {
			console.error(`Error deleting items from ${collection}:`, error);
			throw error;
		}
	};

	return {
		createItem: createItemFn,
		createItems: createItemsFn,
		readItem: readItemFn,
		readAsyncItem: readAsyncItemFn,
		readItems: readItemsFn,
		readAsyncItems: readAsyncItemsFn,
		readSingleton: readSingletonFn,
		readAsyncSingleton: readAsyncSingletonFn,
		updateItem: updateItemFn,
		updateItems: updateItemsFn,
		updateSingleton: updateSingletonFn,
		deleteItem: deleteItemFn,
		deleteItems: deleteItemsFn,
	};
}
