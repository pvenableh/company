import type { File, User } from './system';

/**
 * Legacy Directus Schema for SDK.
 * The primary schema is auto-generated in types/directus.ts.
 * This file retains only system type references.
 */
export interface Schema {
	// System
	directus_files: File[];
	directus_users: User[];
}
