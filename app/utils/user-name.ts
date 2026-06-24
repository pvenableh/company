import type { User } from '~~/types';

export function userName(user: Partial<User> | null | undefined): string {
	// A null/undefined reference means the user row is gone (e.g. deleted, with
	// the FK nulled on delete). Distinguish that from a present-but-unnamed user.
	if (!user) {
		return 'Deleted user' as string;
	}

	if (user.first_name && user.last_name) {
		return `${user.first_name} ${user.last_name}`;
	}

	if (user.first_name) {
		return user.first_name;
	}

	if (user.email) {
		return user.email;
	}

	return 'Unknown User' as string;
}

export function userAvatar(user: Partial<User> | null | undefined): string {
	if (user) {
		if (user.avatar) {
			return `https://admin.earnest.guru/assets/${user.avatar}?key=medium`;
		}

		if (user.first_name && user.last_name) {
			return `https://ui-avatars.com/api/?name=${encodeURIComponent(user.first_name + ' ' + user.last_name)}&background=eeeeee&color=00bfff`;
		}
	}

	return 'https://ui-avatars.com/api/?name=Deleted%20user&background=eeeeee&color=00bfff';
}
