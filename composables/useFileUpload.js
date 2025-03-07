// composables/useFileUpload.js

export function useFileUpload() {
	const _isUploading = ref(false);
	const _uploadProgress = ref(0);
	const _currentFile = ref('');
	const abortController = ref(null);

	// More detailed file type mappings with extensions
	const FILE_TYPES = {
		// Images
		'image/jpeg': ['jpg', 'jpeg'],
		'image/png': ['png'],
		'image/gif': ['gif'],
		'image/webp': ['webp'],
		'image/heic': ['heic'],
		'image/heif': ['heif'],
		// Documents
		'application/pdf': ['pdf'],
		'application/msword': ['doc'],
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
		'application/vnd.ms-excel': ['xls'],
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
		'application/vnd.ms-powerpoint': ['ppt'],
		'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
		'text/plain': ['txt'],
		'text/csv': ['csv'],
	};

	// File signatures for better MIME type validation
	const FILE_SIGNATURES = {
		// JPEG signatures
		'image/jpeg': [
			{ bytes: [0xff, 0xd8, 0xff, 0xe0], offset: 0 },
			{ bytes: [0xff, 0xd8, 0xff, 0xe1], offset: 0 },
			{ bytes: [0xff, 0xd8, 0xff, 0xe2], offset: 0 },
		],
		// PNG signature
		'image/png': [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 }],
		// GIF signatures
		'image/gif': [
			{ bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], offset: 0 }, // GIF87a
			{ bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], offset: 0 }, // GIF89a
		],
		// PDF signature
		'application/pdf': [{ bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 }], // %PDF
		// ZIP signatures (used in Office files)
		'application/zip': [{ bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0 }], // PK..
		// Office Open XML formats (they use ZIP signatures but we map them to their proper types)
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
			{ bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0 }, // Same as ZIP signature
		],
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
			{ bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0 }, // Same as ZIP signature
		],
		'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
			{ bytes: [0x50, 0x4b, 0x03, 0x04], offset: 0 }, // Same as ZIP signature
		],
	};

	// Potentially dangerous content patterns
	const DANGEROUS_CONTENT_PATTERNS = [
		// Common executable code patterns
		/<script[^>]*>[\s\S]*?<\/script>/i, // Scripts
		/(\beval\s*\(|\bexec\s*\(|\bFunction\s*\()/i, // JavaScript eval/exec
		/<iframe[^>]*>[\s\S]*?<\/iframe>/i, // iframes
		/\b(powershell|cmd\.exe|bash|sh)\b/i, // Shell commands
		/<%[^%]*%>/i, // ASP/JSP tags
		/\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b.*\b(FROM|INTO|TABLE|DATABASE)\b/i, // SQL
	];

	const ALLOWED_IMAGE_TYPES = Object.keys(FILE_TYPES).filter((type) => type.startsWith('image/'));
	const ALLOWED_DOCUMENT_TYPES = Object.keys(FILE_TYPES).filter((type) => !type.startsWith('image/'));

	const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB - Consider moving to config
	const MAX_FILES = 5; // Consider moving to config
	const IMAGE_COMPRESSION_QUALITY = 0.75; // Default compression quality

	// Detects actual file type by examining file signatures (magic numbers)
	const detectFileType = async (file) => {
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				const buffer = e.target.result;
				const arr = new Uint8Array(buffer);

				// Check all known signatures
				for (const [mimeType, signatures] of Object.entries(FILE_SIGNATURES)) {
					for (const sig of signatures) {
						let match = true;
						for (let i = 0; i < sig.bytes.length; i++) {
							if (arr[sig.offset + i] !== sig.bytes[i]) {
								match = false;
								break;
							}
						}
						if (match) {
							resolve(mimeType);
							return;
						}
					}
				}

				// If no signature match, return the reported type
				resolve(file.type);
			};

			// Read the first 16 bytes of the file (enough for most signatures)
			reader.readAsArrayBuffer(file.slice(0, 16));
		});
	};

	// Enhanced detection for Office documents
	const enhanceFileTypeDetection = (detectedType, file) => {
		// If we detect a ZIP file, check the extension to see if it's an Office document
		if (detectedType === 'application/zip') {
			const extension = file.name.split('.').pop().toLowerCase();

			// Map Office extensions to their proper MIME types
			const extensionTypeMap = {
				docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			};

			if (extension in extensionTypeMap) {
				return extensionTypeMap[extension];
			}
		}

		return detectedType;
	};

	// Validate file extension against reported MIME type
	const validateFileExtension = (filename, mimeType) => {
		const extension = filename.split('.').pop().toLowerCase();
		const validExtensions = FILE_TYPES[mimeType] || [];
		return validExtensions.includes(extension);
	};

	// Scan for potentially dangerous content in text files
	const scanForDangerousContent = async (file) => {
		return new Promise((resolve) => {
			// Only scan text-based files
			const textTypes = ['text/plain', 'text/html', 'text/csv', 'application/json', 'application/xml'];
			if (file.size > 1024 * 1024 * 5 || !textTypes.includes(file.type)) {
				resolve({ isSafe: true }); // Skip large files or non-text files
				return;
			}

			const reader = new FileReader();
			reader.onload = (e) => {
				const content = e.target.result;
				const dangerousPatterns = DANGEROUS_CONTENT_PATTERNS.filter((pattern) => pattern.test(content));

				resolve({
					isSafe: dangerousPatterns.length === 0,
					issues: dangerousPatterns.map((p) => `Contains potentially dangerous pattern: ${p}`),
				});
			};
			reader.readAsText(file);
		});
	};

	// Compress image before upload
	const compressImage = async (file, quality = IMAGE_COMPRESSION_QUALITY) => {
		if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 100 * 1024) {
			return file; // Don't compress GIFs or small images
		}

		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = (event) => {
				const img = new Image();
				img.onload = () => {
					const canvas = document.createElement('canvas');
					const ctx = canvas.getContext('2d');

					// Preserve aspect ratio but cap max dimensions
					const MAX_WIDTH = 2048;
					const MAX_HEIGHT = 2048;
					let width = img.width;
					let height = img.height;

					if (width > height) {
						if (width > MAX_WIDTH) {
							height = Math.round(height * (MAX_WIDTH / width));
							width = MAX_WIDTH;
						}
					} else {
						if (height > MAX_HEIGHT) {
							width = Math.round(width * (MAX_HEIGHT / height));
							height = MAX_HEIGHT;
						}
					}

					canvas.width = width;
					canvas.height = height;

					// Draw and export
					ctx.drawImage(img, 0, 0, width, height);

					// Convert to blob with compression
					canvas.toBlob(
						(blob) => {
							if (!blob) {
								console.warn('Compression failed, using original file');
								resolve(file);
								return;
							}

							// Create a new file with the compressed blob
							const compressedFile = new File([blob], file.name, {
								type: file.type,
								lastModified: file.lastModified,
							});

							// Only use the compressed version if it's actually smaller
							if (compressedFile.size < file.size) {
								resolve(compressedFile);
							} else {
								resolve(file); // Use original if compression didn't help
							}
						},
						file.type,
						quality,
					);
				};
				img.src = event.target.result;
			};
			reader.readAsDataURL(file);
		});
	};

	const sanitizeFilename = (filename) => {
		if (!filename) return '';
		// Remove path information, just keep the filename
		const sanitized = filename.replace(/^.*[\\\/]/, '');
		// Allow spaces and common characters, replace problematic ones with underscore
		return sanitized.replace(/[<>:"/\\|?*]/g, '_');
	};

	const validateFile = async (file, options = {}) => {
		const errors = [];
		const warnings = [];

		// Compression options
		const compressImages = options.compressImages !== false;

		// Size validation
		if (file.size > MAX_FILE_SIZE) {
			errors.push(`File "${file.name}" exceeds maximum size of ${formatFileSize(MAX_FILE_SIZE)}`);
		}

		// Enhanced MIME type validation
		const reportedType = file.type;
		const actualType = await detectFileType(file);
		const enhancedType = enhanceFileTypeDetection(actualType, file);

		// Check if type is allowed
		const isAllowedType = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES].includes(enhancedType);
		if (!isAllowedType) {
			errors.push(`File type "${enhancedType}" is not allowed for "${file.name}"`);
		}

		// Check if file extension matches the content type
		const extensionMatches = validateFileExtension(file.name, enhancedType);
		if (!extensionMatches) {
			errors.push(`File extension of "${file.name}" doesn't match its content type (${enhancedType})`);
		}

		// Check for type mismatch (possible spoofing)
		if (enhancedType !== reportedType && reportedType !== '') {
			warnings.push(`File type mismatch: reported as ${reportedType}, detected as ${enhancedType}`);
		}

		// Additional extension checks
		if (file.name.match(/\.(exe|sh|bat|cmd|php|pl|py|js|jsp|asp|html|htm)$/i)) {
			errors.push(`File "${file.name}" has a potentially dangerous extension`);
		}

		// Check for zip files (but allow Office files)
		const isOfficeFile = ['docx', 'xlsx', 'pptx'].includes(file.name.split('.').pop().toLowerCase());
		if (enhancedType === 'application/zip' && !isOfficeFile) {
			errors.push(`Zip files are not allowed`);
		}

		// Check filename safety
		const fileNameWithoutPath = file.name.replace(/^.*[\\\/]/, '');
		const sanitizedFilename = sanitizeFilename(fileNameWithoutPath);
		if (sanitizedFilename !== fileNameWithoutPath) {
			errors.push(`File name "${file.name}" contains invalid characters (< > : " / \\ | ? *)`);
		}

		// Content safety scan for text files
		const contentScan = await scanForDangerousContent(file);
		if (!contentScan.isSafe) {
			errors.push(...contentScan.issues);
		}

		// Process file (compression if needed)
		let processedFile = file;
		if (compressImages && file.type.startsWith('image/') && errors.length === 0) {
			try {
				const originalSize = file.size;
				processedFile = await compressImage(file);

				if (processedFile.size < originalSize) {
					const savedPercentage = Math.round((1 - processedFile.size / originalSize) * 100);
					warnings.push(
						`Image compressed: ${formatFileSize(originalSize)} → ${formatFileSize(processedFile.size)} (${savedPercentage}% smaller)`,
					);
				}
			} catch (e) {
				console.error('Image compression failed:', e);
				warnings.push('Image compression failed, using original file');
				processedFile = file;
			}
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
			processedFile: processedFile,
		};
	};

	const validateFiles = async (files, options = {}) => {
		const errors = [];
		const warnings = [];
		const processedFiles = [];

		if (files.length > MAX_FILES) {
			errors.push(`Maximum ${MAX_FILES} files can be uploaded at once`);
			return { isValid: false, errors, warnings, processedFiles: [] };
		}

		// Process each file
		const fileValidations = await Promise.all(
			Array.from(files).map(async (file) => {
				const result = await validateFile(file, options);
				return result;
			}),
		);

		// Collect all errors and warnings
		fileValidations.forEach((validation, index) => {
			if (validation.errors.length > 0) {
				errors.push(...validation.errors.map((err) => `[${files[index].name}] ${err}`));
			}
			if (validation.warnings.length > 0) {
				warnings.push(...validation.warnings.map((warn) => `[${files[index].name}] ${warn}`));
			}
			// Add processed file if valid
			if (validation.isValid) {
				processedFiles.push(validation.processedFile);
			}
		});

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
			processedFiles,
		};
	};

	const processUpload = async (files, options = {}) => {
		// Validate and process files
		const validation = await validateFiles(files, options);
		if (!validation.isValid) {
			return { success: false, errors: validation.errors, warnings: validation.warnings };
		}

		const formData = new FormData();
		const processedFilesInfo = [];

		// Add processed files to form data
		for (const file of validation.processedFiles) {
			const sanitizedName = sanitizeFilename(file.name);
			formData.append('file', file, sanitizedName);
			processedFilesInfo.push({
				originalName: file.name,
				sanitizedName,
				type: file.type,
				size: file.size,
			});
		}

		return {
			success: true,
			formData,
			processedFilesInfo,
			warnings: validation.warnings,
		};
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
					try {
						const result = JSON.parse(xhr.responseText);
						setProgress(100);
						resolve(result.data ? result.data : result);
					} catch (error) {
						reject(new Error(`Failed to parse server response: ${error.message}`));
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
			abortController.value = null;
		}
	};

	// Mutator functions
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
		abortController.value = null;
	};

	return {
		// File validation functions
		validateFile,
		validateFiles,

		// Processing functions
		processUpload,
		sanitizeFilename,
		compressImage,
		detectFileType,

		// Upload functions
		uploadFilesWithProgress,
		cancelUpload,

		// Helper functions
		formatFileSize,

		// State management
		startUpload,
		setProgress,
		resetUploadState,
		setCurrentFile,

		// State accessors
		isUploading: readonly(_isUploading),
		uploadProgress: readonly(_uploadProgress),
		currentFile: readonly(_currentFile),

		// Constants
		ALLOWED_IMAGE_TYPES,
		ALLOWED_DOCUMENT_TYPES,
		MAX_FILE_SIZE,
		MAX_FILES,
		IMAGE_COMPRESSION_QUALITY,
	};
}
