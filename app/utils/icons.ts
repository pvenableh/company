type FileType =
	| 'folder'
	| 'image/jpeg'
	| 'image/png'
	| 'image/gif'
	| 'image/svg+xml'
	| 'image/webp'
	| 'video/mp4'
	| 'video/quicktime'
	| 'audio/mp3'
	| 'audio/aac'
	| 'audio/wav'
	| 'audio/ogg'
	| 'text/csv'
	| 'text/plain'
	| 'application/pdf'
	| 'application/vnd.ms-excel'
	| 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	| 'application/msword'
	| 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
	| 'application/vnd.ms-powerpoint'
	| 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export const fileIconMap: Record<FileType, string> = {
	folder: 'material-symbols:folder',
	// Images
	'image/jpeg': 'material-symbols:image',
	'image/png': 'material-symbols:image',
	'image/gif': 'material-symbols:image',
	'image/svg+xml': 'material-symbols:image',
	'image/webp': 'material-symbols:image',
	// Videos
	'video/mp4': 'material-symbols:smart-display',
	'video/quicktime': 'material-symbols:smart-display',
	// Audio
	'audio/mp3': 'material-symbols:audio-file',
	'audio/aac': 'material-symbols:audio-file',
	'audio/wav': 'material-symbols:audio-file',
	'audio/ogg': 'material-symbols:audio-file',
	// Text
	'text/csv': 'material-symbols:csv',
	'text/plain': 'material-symbols:text-snippet',

	// Files
	'application/pdf': 'material-symbols:picture-as-pdf-sharp',
	'application/vnd.ms-excel': 'material-symbols:sheets',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'material-symbols:sheets',
	'application/msword': 'material-symbols:docs',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'material-symbols:docs',
	'application/vnd.ms-powerpoint': 'material-symbols:slides',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'material-symbols:slides',
};

export function getFileIcon(filetype: FileType | string | null | undefined) {
	if (!filetype) return 'material-symbols:attachment';

	if (typeof filetype === 'string' && !(filetype in fileIconMap)) {
		return 'material-symbols:attachment';
	}

	return fileIconMap[filetype as FileType];
}

// ── Social platform brand marks (use real logos: marks, not lucide generics) ──

export const socialPlatformIcon: Record<string, string> = {
	facebook: 'logos:facebook',
	instagram: 'logos:instagram-icon',
	linkedin: 'logos:linkedin-icon',
	// Legacy / variant keys all resolve to the LinkedIn brand mark
	'linkedin-personal': 'logos:linkedin-icon',
	'linkedin-org': 'logos:linkedin-icon',
	'linkedin-organization': 'logos:linkedin-icon',
	tiktok: 'logos:tiktok-icon',
	threads: 'logos:threads-icon',
	twitter: 'logos:x',
	x: 'logos:x',
	youtube: 'logos:youtube-icon',
};

export const socialPlatformLabel: Record<string, string> = {
	facebook: 'Facebook',
	instagram: 'Instagram',
	linkedin: 'LinkedIn',
	'linkedin-personal': 'LinkedIn',
	'linkedin-org': 'LinkedIn',
	'linkedin-organization': 'LinkedIn',
	tiktok: 'TikTok',
	threads: 'Threads',
	twitter: 'X',
	x: 'X',
	youtube: 'YouTube',
};

export function getSocialPlatformIcon(platform: string | null | undefined): string {
	if (!platform) return 'lucide:share-2';
	const key = String(platform).toLowerCase().trim();
	return socialPlatformIcon[key] ?? 'lucide:share-2';
}

export function getSocialPlatformLabel(platform: string | null | undefined): string {
	if (!platform) return '';
	const key = String(platform).toLowerCase().trim();
	return socialPlatformLabel[key] ?? platform;
}
