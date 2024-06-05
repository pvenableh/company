import type { User } from '~~/types';

export function userName(user: Partial<User>): string {
	if (!user) {
		return 'Unknown User' as string;
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

export function userAvatar(user: Partial<User>): string {
	if (user) {
		if (user.avatar) {
			return `https://admin.huestudios.company/assets/${user.avatar}?key=medium`;
		}

		if (user.first_name && user.last_name) {
			return `https://ui-avatars.com/api/?name=${encodeURIComponent(user.first_name + ' ' + user.last_name)}&background=eeeeee&color=00bfff`;
		}
	}

	return 'https://ui-avatars.com/api/?name=Unknown%20User&background=eeeeee&color=00bfff';
}
