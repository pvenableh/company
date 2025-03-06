// composables/useFileUpload.js

export function useFileUpload() {
	const _isUploading = ref(false);
	const _uploadProgress = ref(0);
	const _currentFile = ref('');
	const abortController = ref(null);

	const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
	const ALLOWED_DOCUMENT_TYPES = [
		'application/pdf',
		'application/msword',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/vnd.ms-excel',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'application/vnd.ms-powerpoint',
		'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		'text/plain',
		'text/csv',
	];
	const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - Consider moving to config
	const MAX_FILES = 5; // Consider moving to config

	const validateFile = (file) => {
		const errors = [];

		if (file.size > MAX_FILE_SIZE) {
			errors.push(`File "${file.name}" exceeds maximum size of ${formatFileSize(MAX_FILE_SIZE)}`);
		}

		const isAllowedType = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES].includes(file.type);
		if (!isAllowedType) {
			errors.push(`File type "${file.type}" is not allowed for "${file.name}"`);
		}

		if (file.name.match(/\.(exe|sh|bat|cmd|php|pl|py|js|jsp|asp|html|htm)$/i)) {
			errors.push(`File "${file.name}" has a potentially dangerous extension`);
		}

		if (file.type === 'application/zip' || file.type === 'application/x-zip-compressed' || file.name.match(/\.zip$/i)) {
			errors.push(`Zip files are not allowed`);
		}

		const sanitizedFilename = sanitizeFilename(file.name);
		if (sanitizedFilename !== file.name) {
			errors.push(`File name "${file.name}" contains invalid characters`);
		}

		return {
			isValid: errors.length === 0,
			errors,
		};
	};

	const validateFiles = (files) => {
		const errors = [];

		if (files.length > MAX_FILES) {
			errors.push(`Maximum ${MAX_FILES} files can be uploaded at once`);
			return { isValid: false, errors }; // Return immediately if too many
		}

		const fileValidations = Array.from(files).map(validateFile);
		const allErrors = fileValidations.flatMap((validation) => validation.errors);

		return {
			isValid: allErrors.length === 0,
			errors: allErrors,
		};
	};

	const sanitizeFilename = (filename) => {
		if (!filename) return '';
		const sanitized = filename.replace(/^.*[\\\/]/, '');
		return sanitized.replace(/[^a-zA-Z0-9.-]/g, '_');
	};

	const processUpload = async (files) => {
		const formData = new FormData();
		const processedFiles = [];

		for (const file of files) {
			const sanitizedName = sanitizeFilename(file.name);
			formData.append('file', file, sanitizedName);
			processedFiles.push({
				originalName: file.name,
				sanitizedName,
				type: file.type,
				size: file.size,
			});
		}
		return { formData, processedFiles };
	};

	const uploadFilesWithProgress = async (formData, onProgress, authToken = null) => {
		abortController.value = new AbortController();
		const signal = abortController.value.signal;

		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();

			xhr.upload.addEventListener('progress', (event) => {
				if (event.lengthComputable) {
					const percentComplete = Math.round((event.loaded / event.total) * 100);
					setProgress(percentComplete);
					if (typeof onProgress === 'function') {
						onProgress(percentComplete, event);
					}
				}
			});

			xhr.addEventListener('load', () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					if (xhr.status >= 200 && xhr.status < 300) {
						const result = JSON.parse(xhr.responseText);
						setProgress(100);
						resolve(result.data ? result.data : result);
					} else {
						reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
					}
				} else {
					reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
				}
			});

			xhr.addEventListener('error', () => {
				reject(new Error('Network error during upload'));
			});
			xhr.addEventListener('abort', () => {
				reject(new Error('Upload aborted'));
			});
			signal.addEventListener('abort', () => {
				xhr.abort();
			});

			const uploadUrl = `${useRuntimeConfig().public.directusUrl}/files`;
			xhr.open('POST', uploadUrl);
			const token = authToken || localStorage.getItem('auth_token') || useRuntimeConfig().public.staticToken;
			if (token) {
				xhr.setRequestHeader('Authorization', `Bearer ${token}`);
			}
			xhr.send(formData);
		});
	};

	const formatFileSize = (bytes) => {
		if (!bytes || isNaN(bytes)) return '0 B';
		if (bytes < 1024) return bytes + ' B';
		else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
		else return (bytes / 1048576).toFixed(1) + ' MB';
	};

	const cancelUpload = () => {
		if (abortController.value) {
			abortController.value.abort();
			abortController.value = null; // Good practice
		}
	};

	// Mutator functions (using the recommended approach)
	const startUpload = () => {
		_isUploading.value = true;
	};

	const setProgress = (progress) => {
		_uploadProgress.value = progress;
	};
	const setCurrentFile = (filename) => {
		_currentFile.value = filename;
	};

	const resetUploadState = () => {
		_uploadProgress.value = 0;
		_isUploading.value = false;
		_currentFile.value = '';
		abortController.value = null; // Reset the abort controller
	};

	return {
		validateFile,
		validateFiles,
		processUpload,
		sanitizeFilename,
		uploadFilesWithProgress,
		cancelUpload,
		formatFileSize,
		startUpload,
		setProgress,
		resetUploadState,
		setCurrentFile,
		isUploading: readonly(_isUploading),
		uploadProgress: readonly(_uploadProgress),
		currentFile: readonly(_currentFile),
		ALLOWED_IMAGE_TYPES,
		ALLOWED_DOCUMENT_TYPES,
		MAX_FILE_SIZE,
		MAX_FILES,
	};
}
