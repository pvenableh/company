// composables/useDirectusFiles.ts
import { useDirectusClient } from './useDirectusClient';
import {
	uploadFiles as sdkUploadFiles,
	importFile,
	readFile,
	readFiles,
	updateFile,
	updateFiles,
	deleteFile,
	deleteFiles,
} from '@directus/sdk';

export function useDirectusFiles() {
	const { client } = useDirectusClient();

	// Define TypeScript interfaces
	interface FileProperty {
		[key: string]: string | number | boolean;
	}

	interface UploadOptions {
		folder?: string;
		title?: string;
		fileProperties?: FileProperty | FileProperty[];
		[key: string]: any;
	}

	// Upload files directly
	const uploadFilesFn = async (files: File | File[], options: UploadOptions = {}) => {
		try {
			// Create FormData for file uploads
			const formData = new FormData();

			// If files is an array, handle multiple files
			if (Array.isArray(files)) {
				files.forEach((file, index) => {
					// Add file-specific properties if provided
					if (options.fileProperties && Array.isArray(options.fileProperties) && options.fileProperties[index]) {
						const fileProps = options.fileProperties[index];
						Object.entries(fileProps).forEach(([key, value]) => {
							formData.append(`file_${index + 1}_${key}`, value as string);
						});
					}
					formData.append('file', file);
				});
			} else {
				// Single file
				// Add file properties if provided
				if (options.fileProperties && !Array.isArray(options.fileProperties)) {
					Object.entries(options.fileProperties).forEach(([key, value]) => {
						formData.append(`file_${key}`, value as string);
					});
				}
				formData.append('file', files);
			}

			// Add folder if specified
			if (options.folder) {
				formData.append('folder', options.folder);
			}

			// Add title if specified (global title)
			if (options.title) {
				formData.append('title', options.title);
			}

			// Handle other global metadata options
			Object.entries(options).forEach(([key, value]) => {
				if (!['folder', 'title', 'fileProperties'].includes(key)) {
					formData.append(key, value);
				}
			});

			// Use the SDK's uploadFiles function
			return await client.value.request(sdkUploadFiles(formData));
		} catch (error) {
			console.error('Error uploading files:', error);
			throw error;
		}
	};

	interface ImportFileData {
		url: string;
		data?: {
			title?: string;
			folder?: string;
			[key: string]: any;
		};
	}

	// Import file from URL
	const importFileFn = async (importData: ImportFileData) => {
		try {
			return await client.value.request(importFile(importData as any));
		} catch (error) {
			console.error('Error importing file:', error);
			throw error;
		}
	};

	// Read a single file
	const readFileFn = async (id: string, query: Record<string, any> = {}) => {
		try {
			return await client.value.request(readFile(id, query));
		} catch (error) {
			console.error('Error reading file:', error);
			throw error;
		}
	};

	// Read a single file asynchronously
	const readAsyncFileFn = async (id: string, query: Record<string, any> = {}) => {
		try {
			return await client.value.request(readFile(id, query));
		} catch (error) {
			console.error('Error reading async file:', error);
			throw error;
		}
	};

	// Read multiple files
	const readFilesFn = async (query: Record<string, any> = {}) => {
		try {
			return await client.value.request(readFiles(query));
		} catch (error) {
			console.error('Error reading files:', error);
			throw error;
		}
	};

	// Read multiple files asynchronously
	const readAsyncFilesFn = async (query: Record<string, any> = {}) => {
		try {
			return await client.value.request(readFiles(query));
		} catch (error) {
			console.error('Error reading async files:', error);
			throw error;
		}
	};

	interface FileUpdateData {
		title?: string;
		description?: string;
		folder?: string;
		tags?: string[];
		[key: string]: any;
	}

	// Update a single file
	const updateFileFn = async (id: string, data: FileUpdateData) => {
		try {
			return await client.value.request(updateFile(id, data));
		} catch (error) {
			console.error('Error updating file:', error);
			throw error;
		}
	};

	interface FilesBulkUpdateData {
		keys: string[];
		data: FileUpdateData;
	}

	// Update multiple files
	const updateFilesFn = async (ids: string[] | Record<string, any>, data: FilesBulkUpdateData) => {
		try {
			if (Array.isArray(ids)) {
				return await client.value.request(updateFiles(ids, data as any));
			} else {
				throw new Error('Invalid argument for updateFiles');
			}
		} catch (error) {
			console.error('Error updating files:', error);
			throw error;
		}
	};

	// Delete a single file
	const deleteFileFn = async (id: string) => {
		try {
			return await client.value.request(deleteFile(id));
		} catch (error) {
			console.error('Error deleting file:', error);
			throw error;
		}
	};

	// Delete multiple files
	const deleteFilesFn = async (ids: string[] | { filter: Record<string, any> }) => {
		try {
			if (Array.isArray(ids)) {
				return await client.value.request(deleteFiles(ids));
			} else {
				throw new Error('Invalid argument for deleteFiles');
			}
		} catch (error) {
			console.error('Error deleting files:', error);
			throw error;
		}
	};

	return {
		uploadFiles: uploadFilesFn,
		importFile: importFileFn,
		readFile: readFileFn,
		readAsyncFile: readAsyncFileFn,
		readFiles: readFilesFn,
		readAsyncFiles: readAsyncFilesFn,
		updateFile: updateFileFn,
		updateFiles: updateFilesFn,
		deleteFile: deleteFileFn,
		deleteFiles: deleteFilesFn,
	};
}
